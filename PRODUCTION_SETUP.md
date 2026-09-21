# Production Setup

Panduan target deployment untuk VPS Ubuntu terbaru menggunakan Node.js,
systemd, dan Caddy.

## Important Status

The current project is still a local proof of concept. Do not expose the
current server directly to the public internet without completing the
production work in this document.

The current local implementation still uses:

- `express-session` MemoryStore.
- In-memory token and live-monitor state.
- A single-user native roster cache.
- A frontend API URL that defaults to localhost.
- A native flow designed for a local companion API.

For a private one-channel test, the current server can run on a VPS behind
HTTPS. For public multi-user use, complete the production checklist first.

## Target Architecture

Recommended DNS and service layout:

```text
app.example.com  -> Caddy -> Vite static files
api.example.com  -> Caddy -> Node.js API on 127.0.0.1:8787
```

Components:

- Caddy for HTTPS and reverse proxy.
- Node.js API for OAuth and YouTube API calls.
- systemd for process supervision.
- PostgreSQL for users, connections, roster, and event state.
- Persistent session store such as PostgreSQL or Redis.
- Background worker for live membership polling.
- Native pairing API for OBS clients.

## VPS Assumptions

Commands in this guide assume:

- Ubuntu 24.04 LTS or newer.
- A non-root deployment user named `member-credits`.
- Project path `/opt/member-credits`.
- App domain `app.example.com`.
- API domain `api.example.com`.
- DNS A records pointing both domains to the VPS public IP.

Replace these values with your actual domain and paths.

## DNS

Create these DNS records:

```text
app.example.com  A  <VPS_PUBLIC_IP>
api.example.com  A  <VPS_PUBLIC_IP>
```

Wait until both records resolve before configuring Caddy.

Check from a local machine:

```bash
dig +short app.example.com
dig +short api.example.com
```

## Install System Packages

```bash
sudo apt update
sudo apt install -y \
  ca-certificates \
  curl \
  git \
  build-essential \
  pkg-config \
  libfreetype6-dev
```

Install Node.js 22 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Native OBS compilation is normally performed on a machine with the OBS SDK.
The VPS does not need OBS unless you intentionally build the native plugin
there. Native plugin users receive the platform-specific plugin package.

## Create Deployment User and Directories

```bash
sudo adduser --system --group --home /opt/member-credits member-credits
sudo mkdir -p /opt/member-credits
sudo mkdir -p /etc/member-credits
sudo mkdir -p /var/lib/member-credits
sudo chown -R member-credits:member-credits /opt/member-credits /var/lib/member-credits
sudo chmod 750 /etc/member-credits
```

## Deploy the Project

Clone the repository into the deployment path:

```bash
sudo -u member-credits git clone <REPOSITORY_URL> /opt/member-credits
cd /opt/member-credits
sudo -u member-credits npm ci
sudo -u member-credits npm run build
```

Do not copy `.env.local` from a development machine. Create a production
environment file on the VPS instead.

## Google OAuth Production Setup

In Google Cloud Console:

1. Enable YouTube Data API v3.
2. Configure the OAuth consent screen.
3. Add the production app information.
4. Add production test users while the app is in testing mode.
5. Create or update a Web Application OAuth Client ID.
6. Add this exact redirect URI:

```text
https://api.example.com/auth/google/callback
```

The production OAuth scopes currently include:

```text
https://www.googleapis.com/auth/youtube.channel-memberships.creator
https://www.googleapis.com/auth/youtube.readonly
```

Membership access depends on YouTube channel eligibility. Google OAuth success
does not guarantee that membership endpoints are available.

Store the credential JSON outside the repository:

```bash
sudo install -o member-credits -g member-credits -m 600 \
  client_secret.json /etc/member-credits/google-client-secret.json
```

Never commit this file or place it inside a public web directory.

## Production Environment File

Create `/etc/member-credits/member-credits.env`:

```dotenv
NODE_ENV=production
PORT=8787
FRONTEND_URL=https://app.example.com
GOOGLE_CREDENTIALS_PATH=/etc/member-credits/google-client-secret.json
GOOGLE_REDIRECT_URI=https://api.example.com/auth/google/callback
SESSION_SECRET=replace-with-a-long-random-secret
NATIVE_ROSTER_PATH=/var/lib/member-credits/member-roster.txt
```

Generate a strong session secret:

```bash
openssl rand -hex 32
```

Protect the file:

```bash
sudo chown root:member-credits /etc/member-credits/member-credits.env
sudo chmod 640 /etc/member-credits/member-credits.env
```

The current server uses the roster path for a local companion cache. A real
multi-user deployment must replace this with per-user storage and an
authenticated native API.

## systemd API Service

Create `/etc/systemd/system/member-credits-api.service`:

```ini
[Unit]
Description=Member Credits API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=member-credits
Group=member-credits
WorkingDirectory=/opt/member-credits
EnvironmentFile=/etc/member-credits/member-credits.env
ExecStart=/usr/bin/node /opt/member-credits/server/index.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/member-credits

[Install]
WantedBy=multi-user.target
```

Enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now member-credits-api
sudo systemctl status member-credits-api
```

API health check from the VPS:

```bash
curl http://127.0.0.1:8787/health
```

View logs:

```bash
sudo journalctl -u member-credits-api -f
```

## Caddy

Install Caddy from the official Debian package repository:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```caddyfile
app.example.com {
    root * /opt/member-credits/dist
    encode gzip
    try_files {path} /index.html
    file_server
}

api.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

Caddy obtains and renews HTTPS certificates automatically when DNS and ports
80/443 are reachable.

Open firewall ports:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do not expose port `8787` publicly. The API should only be reachable through
Caddy.

## Frontend API Configuration

Before production build, replace the hardcoded local API base in the frontend
with a production-aware value, for example:

```text
VITE_API_BASE=https://api.example.com
```

Then rebuild:

```bash
cd /opt/member-credits
sudo -u member-credits npm run build
```

The frontend must never call `http://localhost:8787` for a remote user.

## Native Plugin Production Requirement

The current native plugin opens a local URL and reads a local roster cache.
That is suitable for local development only.

For users on other computers, implement native pairing:

1. Native generates a one-time pairing code.
2. Native opens `https://app.example.com/connect/native?code=...`.
3. User completes Google OAuth in the browser.
4. API binds the YouTube connection to the pairing request.
5. Native receives a short-lived device token.
6. Native fetches roster and live events through `https://api.example.com`.
7. Refresh tokens remain server-side and never enter OBS scene settings.

Do not use a VPS filesystem path as a cache path for a remote native plugin.

## Production Data and Security Checklist

Before inviting public users, complete all items below:

- Replace express-session MemoryStore.
- Store sessions in PostgreSQL or Redis.
- Store users and YouTube connections per account.
- Encrypt refresh tokens at rest.
- Persist refreshed tokens.
- Remove global `latestTokens` state.
- Run live polling per connected channel.
- Deduplicate live event IDs in persistent storage.
- Add authentication to native API endpoints.
- Add device revocation and disconnect account.
- Add rate limiting.
- Restrict CORS to the production frontend origin.
- Set secure cookies behind the HTTPS proxy.
- Add `app.set('trust proxy', 1)` when appropriate.
- Validate OAuth state and callback errors.
- Keep Google credentials outside the repository.
- Keep production `.env` files outside the web root.
- Back up the database.
- Do not log access or refresh tokens.

## Update and Rollback

Update the application:

```bash
cd /opt/member-credits
sudo -u member-credits git pull --ff-only
sudo -u member-credits npm ci
sudo -u member-credits npm run format:check
sudo -u member-credits npm run build
sudo systemctl restart member-credits-api
sudo systemctl reload caddy
```

Check status:

```bash
sudo systemctl status member-credits-api
sudo journalctl -u member-credits-api -n 100 --no-pager
```

Rollback the repository if a deployment fails:

```bash
cd /opt/member-credits
sudo -u member-credits git log --oneline -5
sudo -u member-credits git checkout <KNOWN_GOOD_COMMIT>
sudo -u member-credits npm ci
sudo -u member-credits npm run build
sudo systemctl restart member-credits-api
```

## Temporary Public Testing Without a Domain

Use Cloudflare Quick Tunnel from a local reverse proxy or the VPS:

```bash
cloudflared tunnel --url http://127.0.0.1:8080
```

The generated `trycloudflare.com` URL is temporary. If it changes, update the
Google OAuth redirect URI and application environment before logging in again.
This mode is for test users only and is not a production deployment.
