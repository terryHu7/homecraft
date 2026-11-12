# Site Metadata

`homecraft.json` stores public website information — name, introduction, logo, etc. — in the same directory as the home page. Readers fetch this file directly without parsing the page or executing website scripts.

```json
{
  "version": 1,
  "name": "Alex's Home",
  "url": "https://alex.example/home/",
  "logo": "assets/favicon.png",
  "intro": { "zh": "我的作品与写作", "en": "My work and writing" },
  "lang": ["zh", "en"],
  "homecraft": true
}
```

| Field | Rule |
| --- | --- |
| `version` | Required, currently `1`. Only compatible fields will be added in the future |
| `name` | Required, the site's name, up to 60 characters; supports `{ "zh": "…", "en": "…" }` |
| `url` | The home page's full public address. When empty, readers use the JSON file's directory URL, allowing local previews |
| `logo` | A square website logo, recommended at 128×128, up to 100 KB. Supports URLs relative to the JSON file's directory; the earlier `avatar` field is also accepted |
| `intro` | One-line introduction, up to 120 characters, a string or `{ "zh": "…", "en": "…" }` |
| `lang` | An array of `zh`, `en` |
| `homecraft` | Whether the site supports the portal protocol; set to `true` after integration |
| `doors` | Optional, the destinations of the site's one-way door rings (`DOORS` in `world/layout.js`): an array of up to 16 URLs. Other worlds read this to draw the world map's relationship lines, so keep it in sync with the layout. Malformed entries and the site itself are ignored |

`logo` and `intro` may be left empty during local previews. Both are required when requesting a directory listing and can be supplied in the request form or in this file. AI agents must use information provided or confirmed by the user and leave missing fields empty.

Character skins are configured through `skin` in `home.config.js`; see the [avatar guide](avatar.md).

`intro` supplies the portal introduction. Page descriptions, share cards and body text are maintained separately; confirm which field needs updating when making changes.

## Reading It

`engine/door-metadata.js` provides `readSiteInfo(worldURL)` and `metadataURL(worldURL)`, supporting subdirectories, relative logo URLs and bilingual information, with response size limits and timeouts. A failed read does not block a visit.

The public directory displays reviewed information; opening a portal does not re-fetch each website's `homecraft.json`. See [Request listing](worlds.md) for updates. The bundled Terry entry can appear without fetching the public directory.

The return button shows the origin website's name: it prefers the `homecraft.json` read at departure, falls back to the page `<title>`, and displays the origin URL if the link carries no name. Names and introductions are shown as plain text.

## Cross-Site Reads

The local `tools/serve.py` allows cross-origin reads only for `homecraft.json`. Configure these response headers for the file when deploying:

```http
Access-Control-Allow-Origin: *
Cache-Control: no-cache
```

For Caddy, add the following inside the site block:

```caddy
@homecraftMetadata path /homecraft.json
header @homecraftMetadata Access-Control-Allow-Origin "*"
```

For Nginx, add the corresponding headers in `location = /homecraft.json`. Cloudflare Pages and Netlify can use the bundled `_headers` file. Adjust the matching path for subdirectory deployments. After deploying, verify access with a browser `fetch` from a page on another origin.
