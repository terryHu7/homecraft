# Office dashboard

Run `npm install` and copy `.env.example` to `.env` if needed. Set `MONGODB_URI` to the database connection string and `MONGODB_DB` to the intended database name. Set `JWT_SECRET` to the output of `node -p "require('node:crypto').randomBytes(32).toString('hex')"`. Keep the URI and signing secret private.

Seed the admin account from PowerShell 7. The command prompts for the initial password without displaying it. Use 12 or more characters and at most 72 UTF-8 bytes.

```powershell
Read-Host -MaskInput 'Initial admin password' | npm run seed:office -- you@example.com
```

The email argument is required. Replace the example email with your own. Seeding leaves an existing account's password intact. MongoDB stores bcrypt hashes in `users`, refresh sessions in `admin_sessions`, and published content in `office`.

Run `npm run serve:office` and open `http://127.0.0.1:8000/admin` or use the port reported by the Node server. Running `python tools/serve.py` also starts the Node server when MongoDB is configured and opens the world on a free port. Add `/admin` to that address. Existing local content in `.office-data/office.json` can still be read when no MongoDB URI is set.

The editor renews expired 15-minute access tokens using a rotating refresh token. Sign-in expires after seven days. For production, set `NODE_ENV=production` and `PUBLIC_ORIGIN` to the site's HTTPS origin. Set `HOST` to `0.0.0.0` if the hosting platform requires it.

In the editor, save after adding, editing, or removing experience, skills, or projects. The résumé image and each living-room frame accept an HTTPS URL or an uploaded PNG, JPEG, or WebP under 750 KB. The office generates a résumé image from the entered content when the image field is blank. The public scene loads saved living-room pictures on its next page load. Press F at the upstairs computer to open the portfolio and use Escape or Stand up to leave.
