# multiplayer — Homecraft 多人在线

Homecraft 的可选多人在线模块：任何人打开网站就直接"进岛"，以 `Token-xxxx` 的名字、
一张随机生成的皮肤出现在岛上，彼此看到走动、飞行、游泳，可以按 `T` 群聊（头顶冒气泡）。
服务器不存任何东西——聊天不留历史，人员名单只在内存里；服务器停机时网站照常可玩，
只是变回单人，恢复后自动重连。

引擎零改动。站点没有配置服务器时，本模块完全不参与，行为和安装前一样。

## 一分钟跑起来（demo）

```sh
npm install        # 一次即可（装 Playwright）
npm run demo:mp    # 自动起房间服务器（含 3 个散步假人）+ 并排开两个浏览器窗口
```

两个窗口就是两个访客：在一个窗口用 WASD 走动、按 `T` 聊天，另一个窗口实时可见。
Ctrl+C 退出并清理全部进程。自动化回归用 `npm run check:mp`。

```
multiplayer/
  client/    浏览器端（ES 模块，无依赖，随站点静态部署）
  server/    Node 房间服务器（唯一依赖 ws）
  README.md  本文件
  PROTOCOL.md  消息协议 v1
```

## 一、部署房间服务器

> 只想要「从零到上线」的抄作业版（含 systemd/Docker/Caddy 配置与验收清单）：直接看 **[DEPLOY.md](./DEPLOY.md)**。

在一台有 Node 18+ 的机器上（或 Docker，见下）：

```sh
cd multiplayer/server
npm install
SITE='https://你的域名' PORT=8787 node server.js
```

- `SITE` 是允许连接的来源（逗号分隔），浏览器会随 WebSocket 握手带上 Origin，
  不在名单里的连接直接 403。写 `*`（默认）则任何网站都能连——房间按来源隔离，
  不同站点的访客互相看不见，一个服务器可以同时服务多个站。
- `MAX_PLAYERS`（默认 50）是单个房间的容量上限，满了新访客会静默保持单机。
- 用 HTTPS 站点时必须走 `wss://`：把服务器放在 Caddy / Nginx / 隧道后面终止 TLS，
  或参考 Dockerfile。本地 `http://127.0.0.1` 开发时直接 `ws://127.0.0.1:8787`。
- 试玩辅助：`node server.js --bots 12` 会放进 12 个绕圈散步的假人。
  假人的活动范围用 `BOTS_RECT='x0,z0,x1,z1'` 指到你的岛上，例如本岛：
  `BOTS_RECT='-30,6,-12,23' node server.js --bots 12`（默认围原点一小圈）。

Docker：

```sh
docker build -t homecraft-room ./multiplayer
docker run -p 8787:8787 -e SITE='https://你的域名' homecraft-room
```

## 二、接入站点

`home.config.js`：

```js
multiplayer: { endpoint: 'wss://你的房间地址', maxRemote: 24 },
```

- `endpoint` 留空 = 功能关闭（默认值）。
- `maxRemote` 是同屏渲染的远端角色上限：超过 8 人时自动切换到实例化角色池
  （全场共 8 个 draw call，撑得住 10–50 人）；8 人以内用逐人引擎 Avatar
  （每人 8 个 draw call，带手持手机等细节）。访问超出上限时，最近的优先渲染。
- 访客的身份（`Token-xxxx`、随机皮肤种子）存在他们自己浏览器的
  localStorage 里，同一浏览器每次来都是同一张脸。经传送门带着皮肤来的访客
  会穿自己的 PNG 皮肤。`?mp=off` 可临时单机，`?mp=ws://…` 可临时换服务器。
- 界面文案（在线人数提示、聊天占位、进出场提示等）**固定为中文**；其他语言
  的站点复制本模块后，改 `multiplayer/client/chat.js` 顶部那几条字符串即可。

站点构建（`tools/build.sh`）已把 `multiplayer/` 带上。要在**别的** Homecraft 站上用：
把整个 `multiplayer/` 目录拷过去，在它的 `home.config.js` 里加一行 `multiplayer`，
再在它的 `world/build.js` 里加同样的 `setup()` 粘合（见本仓库该文件的注释，约 8 行）。

## 三、验证

```sh
python3 tools/serve.py                        # 终端 1：站点
cd multiplayer/server && node server.js --bots 6   # 终端 2：房间
npm run check:mp                              # 终端 3：双窗口对拍（自动）
```

`check:mp` 会自己起一个临时房间服务器，用两个无头浏览器互相验证在场同步、
聊天往返和断线降级。手动验证：开两个窗口互相走动、按 T 聊天；杀掉服务器看
「重连中…」提示、确认页面还能正常逛，重启服务器看自动恢复。

## 四、边界与说明

- **身份不是认证。** 名字和皮肤只是访客自己浏览器里的随机数，任何人都能伪报；
  这与传送门协议"文本不当身份"的立场一致。公开部署时靠限流兜底（每连接
  状态 24 条/秒、聊天 4 条/10 秒、join 6 次/分、单帧 ≤32KB）。
- **没有任何持久化。** 服务器重启 = 在场清空（客户端自动重连重报）；聊天不落盘。
- **表情/改名/历史消息** 都不是 v1 的一部分；协议字段有版本号，向后兼容
  （只加字段、不改语义），见 PROTOCOL.md。
