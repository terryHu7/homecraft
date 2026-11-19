# Extensions (local preview)

Homecraft loads optional, site-owned extensions through API 1. A new site enables none. The separate `homecraft-extensions` repository contains the catalog workflow and reference examples; it is not required to run or fork Homecraft. The existing `plugin/` directory remains the Portal plugin for other websites.

This preview accepts local files only. It does not download code, run installation hooks, contact a registry, or change a deployed site.

## Site owners

Run from the Homecraft checkout; add `--site /path/to/site` to target another site.

```sh
npm run extensions -- catalog --catalog ../homecraft-extensions/.local/demo/catalog
npm run extensions -- install homecraft.welcome --catalog ../homecraft-extensions/.local/demo/catalog
npm run extensions -- configure homecraft.welcome --set 'message=Hello / 你好'
npm run extensions -- disable homecraft.welcome
npm run extensions -- enable homecraft.welcome
npm run extensions -- update homecraft.welcome --catalog ../homecraft-extensions/.local/demo/catalog
npm run extensions -- rollback homecraft.welcome
npm run extensions -- remove homecraft.welcome
npm run extensions -- doctor
```

Installation copies only the selected package into `extensions/<id>/` and records its exact version, checksum and settings in `extensions.json`. Missing required settings keep the extension disabled. Reload the preview after changes; redeploy to update a public site. Commit installed files and `extensions.json` with your site. All settings are public: never include secrets.

Local recovery snapshots live in ignored `.homecraft/extensions/`. `rollback` reverses the most recent operation for that extension, including removal. Updates and removals refuse changed or unmanaged files. Preserve your edits before retrying. An interrupted process can leave a lock; inspect the snapshot and working tree before removing that lock.

`npm run build` publishes enabled extensions only. `HOMECRAFT_OFFLINE=1 npm run build` skips the online minifier and keeps modules readable. The site must contain API 1 and `extensions: './extensions.json'` in `home.config.js`; the installer never edits your world or engine.

## Authors

```sh
npm run extensions -- init ../my-extension --id author.example
npm run extensions -- check ../my-extension
npm run extensions -- pack ../my-extension --out ../example-0.1.0.json
npm run extensions -- propose ../example-0.1.0.json --out ../submission.json
```

Each extension has `manifest.json`, `index.js`, `README.md` and `LICENSE`. The manifest declares an `author.name` ID, stable `major.minor.patch` version, `apiVersion: 1`, bilingual name/description, author, license, entry, explicit files, capabilities and configuration. Configuration fields support `string`, `number`, `integer`, `boolean`, bilingual labels, defaults, required values, enums, numeric bounds and string length limits. `format: 'url'` allows HTTPS or loopback HTTP. The shared validator in `engine/extension-contract.js` is authoritative.

Packages contain at most 100 files, 2 MiB per file and 8 MiB total. Keep dependencies local, include their licenses, and exclude source servers, tests and unused assets from `files`. Do not add a second Three.js, import engine internals, alter global styles or attach unmanaged listeners. README must explain configuration, services, data use, limitations and a reproducible browser check. Increment the version for every accepted change.

Extension rendering counts toward the complete site's performance budget in `AGENTS.md`. Check the target world on desktop and mobile; a package passing in the empty template does not establish its cost in a larger world.

```js
export function activate(api) {
  api.ui.status({ en: 'Ready', zh: '就绪' });
  // Register asynchronous work through managed callbacks.
}
```

`activate` is synchronous and may return a cleanup function. Configuration changes take effect after reload.

| API | Capability | Behavior |
| --- | --- | --- |
| `options`, `signal`, `asset(path)` | — | Validated settings, lifecycle signal, local asset URL |
| `onDispose(fn)`, `onFrame(fn)`, `interval(fn, ms)` | — | Cleanup, one frame callback, interval of at least 100 ms |
| `ui.status(text)`, `ui.button(text, fn)` | `ui` | Host-styled controls; string or `{en, zh}`; returned `.set(text)` updates text |
| `player.read(out)` | `player.read` | Write `x, y, z, heading` into an existing object |
| `scene.marker(color)` | `scene.markers` | Up to four visitor markers; `.set(pose)`, `.remove()` |
| `network.json(url, init)` | `network` | JSON request to a configured URL path; no credentials, redirects or requests after disposal; five-second timeout |

Managed callback errors stop that extension and dispose its resources. Native ES modules run with page privileges: declarations and static checks are **not a security sandbox**. Only install reviewed, trusted code. Infinite loops or direct global access cannot be isolated by this host. API 1 covers runtime controls, visitor markers and services; new building or physics features require a separately reviewed API change.

## Maintainers

```sh
npm run extensions -- review ../example-0.1.0.json
# For updates, add --previous ../example-0.0.1.json.
npm run extensions -- accept ../submission.json --catalog ../homecraft-extensions/catalog
```

Review the exact package, its capabilities, external services, license and browser behavior before accepting. Static findings are prompts for review, not an approval verdict. Acceptance pins the package checksum; an existing version cannot be replaced. Set a release's catalog `status` to `withdrawn` to prevent new catalog installs. Installed sites keep their pinned copy until their owners act.

The local catalog stores paths relative to its directory; keep referenced packages with the catalog when moving the rehearsal. A future remote catalog can change package transport without changing IDs, manifests, installed site layout or runtime API. It still needs authenticated review and immutable package distribution. A separate repository reduces source coupling; it does not guarantee account-level or content-policy isolation.

Use `--json` on any CLI operation for automation. Validate core changes with `npm run test:extensions`, `npm run check:extensions` and `npm run check:pr`.
