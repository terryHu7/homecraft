# Message Forwarding

Without a Worker, the message form uses `mailbox.email` in `home.config.js` to open the visitor's mail app. If neither the email nor the Worker is configured, the form displays a configuration notice.

To send messages from within the website, deploy a Worker:

1. Turn on Email Routing for your domain in Cloudflare and verify the receiving address.
2. Create a Managed Turnstile widget that allows your site's domain.
3. Configure `SITE`, `FROM`, `TO`, `NAME`, `HOME`, the email binding and KV in `wrangler.jsonc`. `SITE` lists the origins allowed to submit messages, including scheme, hostname and any required port, without a path. The Worker validates Turnstile against these hostnames.
4. Run `npx wrangler secret put SALT` and `npx wrangler secret put TURNSTILE_SECRET_KEY`, then deploy the Worker.
5. In `home.config.js` set `mailbox: { endpoint: 'https://mailbox.example.com/send', email: 'public@example.com', turnstileSitekey: 'your site key' }`. The site key is public; the secret key lives only in the Worker's secrets.

The form requires a single-line subject (up to 80 characters), a message, and contact details. The visitor’s subject is used directly as the email subject. Update the form, shared engine, and Worker together when upgrading an older installation.

After changing the Worker, run `npm run check:mailbox`. The check does not send real mail.
