# 多人在线 · 部署对接速查

前端（静态站）和服务端（Node 房间服务器）**完全分开部署**，只在一条 `wss://` 链接上相遇。
本文以实际域名示例：前端 `https://example.com`，服务器子域 `mp.example.com`（换成任何其他域名完全等价）。

```
访客浏览器 ──HTTPS──> 静态托管（example.com）
     └──────wss──────> mp.example.com (Caddy/TLS) ──> 127.0.0.1:8787 (Node 房间服务器)
```

## 0. 准备

- 一台有公网 IP 的机器（VPS），装好 Node 18+（或只用 Docker）
- DNS：加一条 `mp.example.com` 的 A 记录指向服务器 IP
- 前端无需任何改动即可先上线（endpoint 留空 = 多人关闭，零副作用）

## 1. 部署后端

**方式 A：裸 Node + systemd**

```sh
# 把 multiplayer/server 目录传到服务器（scp / git clone 均可）
cd ~/server && npm install
SITE='https://example.com' PORT=8787 node server.js   # 先手动跑一次，应打印启动行
curl http://127.0.0.1:8787/health                        # 应答 ok, 0 room(s)
```

跑通后交给 systemd 保活：

```ini
# /etc/systemd/system/homecraft-room.service
[Unit]
Description=Homecraft room server
After=network.target

[Service]
WorkingDirectory=/home/你的用户/server
Environment=SITE=https://example.com
Environment=PORT=8787
ExecStart=/usr/bin/node server.js
Restart=always
User=你的用户

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now homecraft-room
```

**方式 B：Docker**（仓库根目录构建，端口只暴露给本机反代）

```sh
docker build -t homecraft-room -f multiplayer/Dockerfile .
docker run -d --name room --restart always -p 127.0.0.1:8787:8787 \
  -e SITE='https://example.com' homecraft-room
```

**环境变量一览**：`SITE`（允许接入的前端来源，逗号分隔，填错=403 拒绝）、
`PORT`（默认 8787）、`MAX_PLAYERS`（单房间上限，默认 50）、
`BOTS_RECT='x0,z0,x1,z1'`（配合 `--bots N` 指定假人散步区）。

## 2. TLS 反代（HTTPS 前端必须走 wss）

Caddy 最省事（自动申请续期证书）：

```
# /etc/caddy/Caddyfile
mp.example.com {
	reverse_proxy 127.0.0.1:8787
}
```

```sh
sudo systemctl reload caddy
curl https://mp.example.com/health    # 应答 ok —— 对外通道就绪
```

<details>（Nginx 等价写法：<code>location / { proxy_pass http://127.0.0.1:8787; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }</code> —— Upgrade 头必须转发，否则握手失败）</details>

## 3. 对接前端

```js
// home.config.js —— 就这一行
multiplayer: { endpoint: 'wss://mp.example.com', maxRemote: 24 },
```

```sh
bash tools/build.sh        # 按你现有的发布流程重新上线
```

发布后打开 `https://example.com`：左下角聊天区出现「**N 人在岛上 · 按 T 聊天**」即接通。
再用一个无痕窗口打开，互相走动、按 T 聊天即可验收。

## 4. 验证清单

- [ ] `curl https://mp.example.com/health` → ok
- [ ] 线上站点左下角出现在线人数提示（不再是「重连中…」）
- [ ] 双窗口/双设备互见走动、聊天带头顶气泡
- [ ] `sudo systemctl stop homecraft-room` → 页面提示「重连中…」但可正常游玩；重启服务 → 几秒内自动恢复
- [ ] 本地回归：`npm run check:mp`（自带临时服务器，不碰线上）

## 5. 常见问题

| 现象 | 原因 |
|---|---|
| F12 控制台 `WebSocket connection failed` | 三查：endpoint 是否 `wss://`（HTTPS 站禁止 ws://）；`SITE` 是否含 `https://example.com`；反代是否转发了 Upgrade 头 |
| 连上但立刻被踢 `full` / `slow` | 房间满员（MAX_PLAYERS）或触发限流——前端会静默回单机，属设计行为 |
| 服务器重启后岛上空了几秒 | 正常：名单只在内存，客户端退避 1–8s 自动重新 join |
| 想临时单机调试 | `?mp=off` 参数，或 endpoint 置空重新发布 |
