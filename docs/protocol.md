# Portal Protocol (Version 1)

This protocol supports navigation between Homecraft websites and websites using the [portal plugin](../plugin/). The public directory is static JSON and navigation uses ordinary links, with no additional backend required.

**Keep the protocol backward compatible.** Deployed websites may use older versions. Fields may be added, but existing fields must not be renamed, removed or given a different meaning. Verify navigation between new and old versions after changes.

Public site details live in `homecraft.json` beside the home page; its fields and cross-site reads are described in [site-metadata.md](site-metadata.md).

## 1. Public Directory

Portals read `https://homecraft.terryhu.cn/worlds.json`, with `https://terryhu7.github.io/homecraft/worlds.json` as the fallback, trying each address in order. The directory is generated from `directory/` in the main repository. See the [public directory](worlds.md) for listing instructions.

Data example:

```json
{
  "version": 1,
  "updated": "2026-10-25T08:00:00.000Z",
  "join": "https://github.com/terryHu7/homecraft/issues/new?template=join.yml",
  "blocked": ["https://bad.example/"],
  "worlds": [
    { "name": "Alex's Home", "url": "https://alex.github.io/home/", "owner": "Alex", "lang": ["zh", "en"],
      "intro": { "zh": "海边的玻璃小屋", "en": "A glass house by the sea" },
      "logo": "https://alex.github.io/home/assets/logo.png",
      "preview": "https://alex.github.io/home/assets/og.jpg", "homecraft": true }
  ]
}
```

| Field | Meaning |
|---|---|
| `name` | Website name, up to 60 characters. A string for one language, or `{ "zh": …, "en": … }` for two |
| `url` | Address, `https://` (`http://` for local testing) |
| `owner` | The author's public name, up to 40 characters |
| `lang` | `"zh"`, `"en"`, or `["zh", "en"]` |
| `intro` | One-line introduction, up to 120 characters, written like `name`. Required |
| `logo` | Required. A square logo hosted on the same website, recommended at 128×128, up to 100 KB. If loading fails, show the first character of the website name. Terry's logo is bundled with the template |
| `preview` | Optional. A preview image URL shown when entering the portal |
| `homecraft` | `true` means the website supports this protocol; navigation carries the origin URL and character skin. `false` or absent means an ordinary link |

`join` and `all` are the optional "Request listing" and "View all" entry URLs. Navigation to `all` carries the origin URL and character skin, as for a `homecraft: true` website.

Reading requirements:

- Ignore unknown fields.
- Show names and intros as plain text; never parse as HTML.
- Display entries as listed in the directory; do not overwrite with the site's live details.
- Hide addresses in `blocked` (and every path under them).
- Bundle Terry's home page entry by default and display it when the portal opens. Retain it if the directory fails to load, is invalid, or has no valid entries. An already-loaded `blocked` list takes precedence.

## 2. Leaving

For a website with `homecraft: true`, use this link format:

```
https://their-address/?from=<the world you left>#homecraft=1&skin=<character>
```

- `from`: the public address of the world being left (origin and pathname only, no query string or fragment), used to show "Back to the previous world".
- `homecraft=1`: the protocol version. Content after `#` is not sent with the HTTP request, but the destination page's JavaScript can read it.
- `fromName`: optional, placed after `#`. The site name from the origin site's `homecraft.json`, falling back to `<title>` on older sites. Plain text, up to 60 characters. The receiver shows "Back to &lt;name&gt;"; if absent, the origin URL is shown instead. Older receivers may ignore this field.
- `skin`: `default` means Homecraft's default character; otherwise a standard four-pixel-arm 64×64 PNG skin file, base64url-encoded to at most 24,000 characters, without padding `=`. A plain blog with no configured author skin uses `default`; when a visitor's skin has already been received, pass it on.
- Set `referrerpolicy="strict-origin-when-cross-origin"` on the navigation link so the receiver can validate the origin. For HTTP debug destinations at localhost, 127.0.0.1, or ::1, use `origin` on that link to preserve the origin when leaving from an HTTPS website. This exception does not apply to other HTTP destinations.

For other websites, use an ordinary link without protocol parameters.

## 3. Arriving

- Arrival requires both the version marker and a valid HTTP(S) `from` whose origin matches the browser's referrer origin. HTTPS returning to local HTTP loses the referrer; that return is allowed only if the current tab remembers having departed for that world. Any other arrival without an origin uses the site owner's character. Origin checking only filters out bad links — a same-origin page can still forge the parameters, so it does not authenticate identity.
- Once validated, save the origin address and character skin in the current tab's `sessionStorage`, then remove `from` and `#homecraft=…` from the address bar.
- A skin must pass length, PNG signature, IHDR 64×64, and actual decode checks; it is redrawn without metadata before use. The site owner's skin is also read with a size limit and a 2.5 s timeout; on failure the default character is used. `default` must always render Homecraft's original green-hoodie character on every receiver — it must not be interpreted as the receiver's own default character.
- When the site has a portal configured, the visitor arrives at the portal; otherwise they start at the spawn point.
- "Back to the previous world" returns to `from`, carrying the character as well.

**Character rule**: opening a website directly uses that website's character. Portal navigation preserves the departure skin; refreshing or continuing to another world also preserves it. Opening a website directly again resets to that website's character.

Skins change only the visitor's local character appearance and do not represent identity authentication or multiplayer. Website content and author avatars remain unchanged; see the [avatar guide](avatar.md) for implementation requirements.

Storage is isolated by website path, with each browser history entry retaining its visit's skin. With `sessionStorage` disabled, the current page can still receive and pass on a skin, but reloading may lose it. Compatibility checks must cover the receiver's actual behavior.

## 4. Constraints

- The site's `Referrer-Policy` must allow portal navigation to carry the origin.
- Links carry protocol fields only. Accounts, email addresses, and other identity information must not appear in links.
- Public directory addresses follow those shipped in the engine.
