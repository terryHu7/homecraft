# Aswin’s World

Aswin’s World is Aswin Raj’s interactive 3D developer portfolio. Explore a traditional Malabar tharavadu, head upstairs to the office computer to see the portfolio, or walk outside to the laterite pond and wooden jetty.

## Explore the world

- Open the upstairs computer to browse the résumé, experience, skills, projects, and contact links.
- Sit on the balcony or the teak oonjal, explore the courtyard, and visit the lotus pond.
- Use the on-screen controls on mobile. On desktop, press **F** near an interactive object.

The world uses Three.js and native ES modules. It runs without a frontend build step and is based on [Homecraft](https://github.com/terryHu7/homecraft).

## Run locally

Install Node.js 22 or later and Python 3. From the repository root, run:

```powershell
npm ci
python tools/serve.py
```

Open the localhost URL printed by the launcher. With no MongoDB configuration, the preview serves the public world with built-in portfolio content.

### Enable the admin editor

1. Copy `.env.example` to `.env` if you’re setting up the project for the first time.
2. Set `MONGODB_URI` to your database connection string. Set `MONGODB_DB` if you want a database name other than `aswins_world`.
3. Generate a signing secret and paste the output into `.env` as `JWT_SECRET`.

   ```powershell
   node -p "require('node:crypto').randomBytes(32).toString('hex')"
   ```

4. Seed an admin account. In PowerShell 7, replace the example email with your own and enter a new password when prompted.

   ```powershell
   Read-Host -MaskInput 'Initial admin password' | npm run seed:office -- you@example.com
   ```

5. Run `npm run serve:office` and open `/admin` on the address it prints. The preview launcher also starts the Node office server automatically when `MONGODB_URI` is set.

MongoDB stores admin accounts with bcrypt password hashes, refresh sessions, and published office content. The editor uses short-lived JWT access tokens and rotating refresh tokens in HTTP-only cookies. See the [admin guide](admin/README.md) for configuration and editing details.

## Project layout

| Path | Purpose |
| --- | --- |
| `world/` | Island layout, house, furniture, and outdoor scenes |
| `assets/` | Portfolio interface, default content, and media |
| `admin/` | Portfolio editor |
| `server/` | Node server, authentication, seed command, and MongoDB access |
| `engine/` | Shared Homecraft engine |

## Checks and deployment

Run `npm run check:site` for site configuration checks. With the preview running, use `npm run check` for desktop and mobile browser checks. Run `npm run check:pr` before pushing.

A static host such as GitHub Pages can serve the public 3D world with its built-in content. To publish edits from `/admin`, deploy the Node server and MongoDB. Set `NODE_ENV=production`, configure the HTTPS site origin in `PUBLIC_ORIGIN`, and inject the MongoDB URI and signing secret through the hosting environment. Commit `.env.example` as the setup template and keep your real `.env` private.

## License

[MIT](LICENSE). The original Homecraft project is by [Terry Hu](https://github.com/terryHu7).
