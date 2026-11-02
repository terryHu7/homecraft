# Portal Plugin

Add a Homecraft portal to an existing website or blog.

1. Copy the entire `plugin/` directory to your site, e.g. as `/homecraft/`.
2. Add the following to your page:

   ```html
   <script type="module" src="/homecraft/homecraft-door.js"></script>
   <homecraft-door></homecraft-door>
   ```

3. Redeploy and verify that the portal can visit a listed website and return. Then submit a [Request listing](https://github.com/terryHu7/homecraft/issues/new?template=join.yml).

| Attribute | Description |
|---|---|
| `lang="zh"` / `lang="en"` | Interface language; defaults to the page's language |

The plugin does not use cookies or provide accounts or analytics. See the [public directory](../docs/worlds.md) for instructions on requesting a listing.

If the website has no `homecraft.json`, provide its introduction and logo in the listing request.

The plugin loads the directory in the background when connected, reuses it for one minute, and shares concurrent requests. Opening it again shows the loaded list immediately. A failed refresh retains the last successful list.

For updates, replace the entire locally hosted `plugin/` directory and redeploy. Keep all companion modules, including `door-directory.js`; updating only `homecraft-door.js` is insufficient. Existing deployments receive code improvements after their owners update them.
