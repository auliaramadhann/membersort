# VPS Testing with Nginx and ngrok

This deployment path supports a small private test group. It uses one public
origin so OAuth redirects and browser session cookies stay together:

```text
ngrok HTTPS -> Nginx 127.0.0.1:8080 -> Node API 127.0.0.1:8787
                                      -> dist/
```

The native OBS plugin uses the public API URL in its `Public API URL` property.
It creates a short-lived pairing request, opens the Google OAuth page in the
tester browser, and then polls a per-device roster endpoint. Google refresh
tokens remain in the API process and are never sent to OBS.

## VPS Setup

Install the runtime packages:

```bash
sudo apt update
sudo apt install -y nginx curl git build-essential libcurl4-openssl-dev
```

Install Node.js 22, deploy the repository to `/var/www/member-credits`, and run:

```bash
sudo -u member-credits npm ci
sudo -u member-credits npm run build
```

Copy the included service and Nginx configuration:

```bash
sudo cp deploy/systemd/member-credits-api.service /etc/systemd/system/
sudo cp deploy/nginx/member-credits.conf /etc/nginx/sites-available/member-credits
sudo ln -s /etc/nginx/sites-available/member-credits /etc/nginx/sites-enabled/member-credits
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now member-credits-api
sudo systemctl enable --now nginx
```

Create `/etc/member-credits/member-credits.env` with values similar to:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
TRUST_PROXY=1
FRONTEND_URL=https://YOUR-NGROK-URL.ngrok-free.app
PUBLIC_URL=https://YOUR-NGROK-URL.ngrok-free.app
GOOGLE_CREDENTIALS_PATH=/etc/member-credits/google-client-secret.json
GOOGLE_REDIRECT_URI=https://YOUR-NGROK-URL.ngrok-free.app/auth/google/callback
SESSION_SECRET=generate-a-long-random-value
NATIVE_ROSTER_PATH=/var/lib/member-credits/member-roster.txt
```

Start ngrok against Nginx:

```bash
ngrok http 127.0.0.1:8080
```

The generated HTTPS URL must be used for both `FRONTEND_URL` and
`PUBLIC_URL`. Add its `/auth/google/callback` path exactly to the Google OAuth
client, then restart the API after changing the environment file.

## Tester Flow

1. Build and distribute the native OBS plugin for each tester.
2. Add a `Member Credits` source in OBS.
3. Set `Public API URL` to the HTTPS ngrok URL.
4. Click `Connect YouTube`.
5. Complete Google OAuth in the browser opened by OBS.
6. The plugin receives a per-device token and refreshes the roster every five seconds.

Use only OAuth Test Users. This branch keeps pairing and device state in
memory, so restarting the API requires each tester to pair again. It is not a
multi-user production implementation.
