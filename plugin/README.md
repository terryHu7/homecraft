# Portal Plugin

Add a Homecraft portal to an existing website or blog.

1. Copy the entire `plugin/` directory to your site, e.g. as `/homecraft/`.
2. Add the following to your page:

   ```html
   <script type="module" src="/homecraft/homecraft-door.js"></script>
   <homecraft-door></homecraft-door>
   ```

| Attribute | Description |
|---|---|
| `lang="zh"` / `lang="en"` | Interface language; defaults to the page's language |

The plugin does not use cookies or provide accounts or analytics. See the [public directory](../docs/worlds.md) for instructions on requesting a listing.

## 在已有网站中安装

1. 将整个 `plugin/` 目录复制到网站中，例如 `/homecraft/`。
2. 在页面中加入上方的 script 和 homecraft-door 标签，重新部署。
3. 打开传送门，确认能访问公共目录中的网站并返回，再填写[申请收录表单](https://github.com/terryHu7/homecraft/issues/new?template=join.yml)。

`lang="zh"` 和 `lang="en"` 可指定界面语言，默认使用页面语言。无需将已有网站改成 3D 网站。没有 homecraft.json 时，在申请表中填写简介和 Logo。
