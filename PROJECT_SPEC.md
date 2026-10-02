# Member Credits Project Specification

Dokumen ini adalah handoff teknis untuk AI atau engineer yang menjalankan,
memelihara, atau mendeploy project Member Credits pada komputer lokal maupun
VPS.

## 1. Project Identity

Project name: `Member Credits`

Project purpose:

- Mengambil data member YouTube.
- Mengelompokkan member berdasarkan membership tier.
- Menampilkan nama member sebagai credit roll atau bottom ticker.
- Menyediakan web dashboard untuk editing dan preview.
- Menyediakan native OBS source untuk rendering langsung di OBS.

Current version: `0.1.0`

Current status: working local proof of concept. Web, local OAuth, YouTube
membership fetching, native OBS rendering, credit roll, bottom ticker, and
button controls are implemented. Public multi-user production is not complete.

## 2. System Architecture

The project contains three runtime components:

| Component             | Technology                    | Responsibility                                                        |
| --------------------- | ----------------------------- | --------------------------------------------------------------------- |
| Dashboard and overlay | React, TypeScript, Vite       | Edit credits, preview animation, generate OBS Browser Source URL      |
| Local/API server      | Node.js, Express, Google APIs | OAuth, YouTube membership fetching, roster export, live event polling |
| Native OBS source     | C++17, libobs, FreeType       | Render credit roll or ticker inside OBS                               |

Current local data flow:

```text
Browser dashboard
  -> local Node API on 127.0.0.1:8787
  -> Google OAuth and YouTube API
  -> member roster text file
  -> native OBS source
```

Web overlay data flow:

```text
Dashboard config
  -> base64 encoded URL parameter
  -> /overlay?config=...
  -> Browser Source in OBS
```

Native OBS data flow:

```text
OBS source properties or roster file
  -> native C++ source
  -> FreeType text rasterization
  -> OBS texture rendering
```

## 3. Important Repository Files

| Path                                       | Purpose                                                           |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `src/App.tsx`                              | React dashboard, overlay, config model, YouTube controls          |
| `src/styles.css`                           | Dashboard styling, preview styling, credit roll, ticker animation |
| `server/index.mjs`                         | Express server, OAuth, YouTube API, roster and live events        |
| `obs-plugin/src/member-credits-source.cpp` | Native OBS renderer, properties, persistence, animation           |
| `obs-plugin/data/locale/en-US.ini`         | Native OBS labels                                                 |
| `obs-plugin/CMakeLists.txt`                | Native plugin build definition                                    |
| `.env.example`                             | Environment variable template                                     |
| `LOCAL_SETUP.md`                           | Local development setup                                           |
| `PRODUCTION_SETUP.md`                      | VPS, systemd, Caddy, and production checklist                     |
| `PROJECT_SPEC.md`                          | This AI handoff specification                                     |

Do not edit or commit:

- `.env.local`
- Google OAuth client secret JSON files.
- OAuth access tokens or refresh tokens.
- OBS session/config dumps.
- Generated `dist/` or native build output unless the repository specifically
  requires them.

## 4. Visual Features

The web and native renderers support the following display modes:

| Mode            | Behavior                                                                |
| --------------- | ----------------------------------------------------------------------- |
| `credit-roll`   | Full title, kicker, tier, member, and footer content scrolls vertically |
| `bottom-ticker` | All member names scroll horizontally in a single lower-third line       |

Text alignment options:

- `left`
- `center`, displayed to users as `Center / Middle`
- `right`

Bottom ticker rules:

- Include every member name in roster order.
- Remove tier headers such as `[Gold Members]`.
- Do not include title, kicker, footer, or tier names.
- Use a horizontal continuous animation.
- Keep the ticker at the bottom of the canvas.

Current visual controls:

- Font size.
- Animation duration/speed.
- Font style on the web dashboard.
- Accent color.
- Member text color.
- Footer color for credit roll.
- Background color.
- Transparent background.
- Text alignment.
- Display mode.

## 5. Tools and Runtime Requirements

### Web and API

- Node.js 22 LTS or newer.
- npm.
- Linux, macOS, or Windows for local development.
- Google Cloud project with YouTube Data API v3 enabled.
- Google OAuth Web Application credentials.

### Native OBS Plugin

- CMake 3.20 or newer.
- Ninja.
- C++17 compiler.
- `pkg-config`.
- OBS Studio.
- OBS development headers and library.
- FreeType development headers and library.
- libcurl development headers and library for remote native pairing.

Ubuntu/Debian packages:

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  cmake \
  ninja-build \
  pkg-config \
  libfreetype6-dev \
  libobs-dev \
  libcurl4-openssl-dev
```

The `libobs-dev` version must be compatible with the installed OBS version.

The VPS does not need OBS or the native plugin unless the VPS is intentionally
used as a native plugin build machine. Native plugin users normally receive a
platform-specific plugin package.

## 6. Important Dependencies

Runtime dependencies from `package.json`:

| Dependency        | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `react`           | Dashboard and overlay UI                    |
| `react-dom`       | React browser rendering                     |
| `vite`            | Development server and production bundler   |
| `express`         | Node HTTP API                               |
| `express-session` | Current local OAuth session storage         |
| `googleapis`      | Google OAuth and YouTube API client         |
| `dotenv`          | Load `.env.local` and environment variables |

Development dependencies:

| Dependency             | Purpose                       |
| ---------------------- | ----------------------------- |
| `typescript`           | Type checking and compilation |
| `@types/react`         | React TypeScript types        |
| `@types/react-dom`     | React DOM TypeScript types    |
| `@vitejs/plugin-react` | Vite React integration        |
| `prettier`             | Formatting and format checks  |

Native dependencies:

- OBS `libobs` and OBS graphics APIs.
- FreeType 2.
- C++17 standard library.

## 7. Environment Variables

Create `.env.local` from `.env.example` for local development.

| Variable                  | Required                   | Local example                                | Production/public example                       |
| ------------------------- | -------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `GOOGLE_CREDENTIALS_PATH` | Yes                        | `/absolute/path/client_secret.json`          | `/etc/member-credits/google-client-secret.json` |
| `GOOGLE_REDIRECT_URI`     | Yes                        | `http://localhost:8787/auth/google/callback` | `https://api.example.com/auth/google/callback`  |
| `SESSION_SECRET`          | Yes                        | Long random local secret                     | Long random production secret                   |
| `FRONTEND_URL`            | Yes                        | `http://localhost:5173`                      | `https://app.example.com`                       |
| `PUBLIC_URL`              | No                         | Same as `FRONTEND_URL`                       | Public origin used by native pairing            |
| `PORT`                    | No                         | `8787`                                       | `8787`                                          |
| `HOST`                    | No                         | `127.0.0.1`                                  | `127.0.0.1`                                     |
| `TRUST_PROXY`             | No                         | `0`                                          | `1`                                             |
| `NATIVE_ROSTER_PATH`      | No                         | Local OBS roster path                        | `/var/lib/member-credits/member-roster.txt`     |
| `OBS_CONFIG_ROOT`         | No                         | OS-specific OBS config root                  | Usually not used by public API                  |
| `VITE_API_BASE`           | Needed for remote frontend | Empty or `http://localhost:8787`             | Public API origin or same-origin proxy path     |

Frontend API configuration:

`src/App.tsx` uses a configurable API base:

```ts
const API_BASE = import.meta.env.VITE_API_BASE || '';
```

For a same-origin Nginx/ngrok deployment, leave `VITE_API_BASE` empty. For a
separate API origin, set it during the frontend build, for example:

```ts
const API_BASE = import.meta.env.VITE_API_BASE || '';
```

Do not assume a remote user's `localhost` points to the VPS. It points to the
remote user's own computer.

## 8. Local Installation

Run from the repository root:

```bash
npm ci
cp .env.example .env.local
```

Edit `.env.local` and set at least:

```dotenv
GOOGLE_CREDENTIALS_PATH=/absolute/path/to/client_secret.json
GOOGLE_REDIRECT_URI=http://localhost:8787/auth/google/callback
SESSION_SECRET=use-a-long-random-secret
FRONTEND_URL=http://localhost:5173
PORT=8787
```

In Google Cloud Console:

1. Enable `YouTube Data API v3`.
2. Configure the OAuth consent screen.
3. Add the Google account as an OAuth Test User while the app is in testing.
4. Create a Web Application OAuth Client ID.
5. Add this exact redirect URI:

```text
http://localhost:8787/auth/google/callback
```

## 9. Run Locally

Use two terminals from the repository root.

Terminal 1, API server:

```bash
npm run dev:server
```

Terminal 2, Vite dashboard:

```bash
npm run dev
```

Open the dashboard:

```text
http://localhost:5173
```

Check API health:

```bash
curl http://localhost:8787/health
```

Expected health response:

```json
{ "ok": true, "service": "member-credits-local-api" }
```

Local OAuth flow:

1. Start the API server.
2. Open the dashboard.
3. Click `Connect YouTube`.
4. Complete Google OAuth.
5. Confirm the dashboard reports a connected channel.
6. Import members or export the native roster.

## 10. Web Production Build

Run formatting and build checks:

```bash
npm run format:check
npm run build
node --check server/index.mjs
```

The Vite production output is written to:

```text
dist/
```

Serve `dist/` with a static web server such as Caddy or Nginx. Run the Node API
as a separate systemd service. Do not run the development Vite server as a
public production service.

## 11. Native OBS Plugin Build

Run from the repository root:

```bash
cmake -S obs-plugin -B obs-plugin/build -G Ninja
cmake --build obs-plugin/build -j$(nproc)
```

Install for the current Linux user:

```bash
cmake --install obs-plugin/build \
  --prefix "$HOME/.config/obs-studio/plugins/member-credits"
```

Restart OBS and add a source named `Member Credits`.

Native property groups:

- `Playback`: Reset & Play, Play, Pause, Stop.
- `Roster and YouTube`: Reload roster, Connect YouTube.
- Display mode: Credit roll or Bottom ticker.
- Text alignment: Left, Center / Middle, Right.

The native plugin currently reads the roster from a local file. The default
Linux cache path is:

```text
~/.config/obs-studio/plugin_config/member-credits/member-roster.txt
```

Do not use a VPS filesystem path as a cache for an OBS plugin running on a
different user's computer.

## 12. API Endpoints

| Method | Path                            | Purpose                                    |
| ------ | ------------------------------- | ------------------------------------------ |
| `GET`  | `/health`                       | Server health check                        |
| `GET`  | `/auth/google`                  | Start Google OAuth                         |
| `GET`  | `/auth/google/callback`         | OAuth callback                             |
| `GET`  | `/api/auth/status`              | Current local session status               |
| `GET`  | `/api/youtube/test`             | Fetch current YouTube members              |
| `GET`  | `/api/youtube/roster.txt`       | Download grouped native roster             |
| `GET`  | `/api/youtube/live/events`      | Fetch/poll live membership events          |
| `GET`  | `/api/native/pairing/start`     | Create a short-lived OBS pairing request   |
| `GET`  | `/api/native/pairing/status`    | Poll native pairing authorization          |
| `GET`  | `/api/native/device/roster.txt` | Fetch a paired device roster and live sync |

Native pairing is implemented for small temporary tests, but pairing, device,
session, and live state are still in memory. This is not production-safe for
multiple users or service restarts.

## 13. Temporary Public Testing With ngrok

ngrok is for temporary testing only. It is not a replacement for HTTPS
production hosting, persistent sessions, a database, or native device pairing.

### Recommended Public Test Architecture

The safest temporary architecture is one public frontend origin with a proxy:

```text
Public ngrok URL
  -> Vite or local reverse proxy on port 5173
  -> frontend static/dev server
  -> /auth and /api proxied to Node API on 127.0.0.1:8787
```

This keeps the browser, OAuth callback, and session cookie on one origin.
Before using this mode, the AI must:

1. Replace the hardcoded `API_BASE` with `VITE_API_BASE` or same-origin paths.
2. Add a Vite proxy for `/auth`, `/api`, and `/health` to
   `http://127.0.0.1:8787`.
3. Set `FRONTEND_URL` to the public ngrok URL.
4. Set `GOOGLE_REDIRECT_URI` to the public ngrok URL plus
   `/auth/google/callback`.
5. Add that exact redirect URI to the Google OAuth client configuration.

Example Vite proxy shape:

```ts
server: {
  host: '0.0.0.0',
  proxy: {
    '/api': 'http://127.0.0.1:8787',
    '/auth': 'http://127.0.0.1:8787',
    '/health': 'http://127.0.0.1:8787',
  },
}
```

Start the local processes:

```bash
npm run dev:server
npm run dev -- --host 0.0.0.0 --port 5173
```

Start ngrok:

```bash
ngrok http 5173
```

Use the HTTPS URL displayed by ngrok as `PUBLIC_URL`:

```dotenv
FRONTEND_URL=https://PUBLIC_URL.ngrok-free.app
GOOGLE_REDIRECT_URI=https://PUBLIC_URL.ngrok-free.app/auth/google/callback
```

Restart the API after changing environment variables. Then open the public
HTTPS URL in a browser and test OAuth.

### Two-Tunnel Alternative

If frontend proxying is not implemented, use two ngrok tunnels:

```bash
ngrok http 5173
ngrok http 8787
```

Then configure:

```dotenv
FRONTEND_URL=https://PUBLIC_FRONTEND.ngrok-free.app
GOOGLE_REDIRECT_URI=https://PUBLIC_API.ngrok-free.app/auth/google/callback
VITE_API_BASE=https://PUBLIC_API.ngrok-free.app
```

This requires additional cookie and CORS work because the frontend and API are
on different origins. For HTTPS cross-origin sessions, the server may need:

```js
cookie: {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
}
```

Also configure `app.set('trust proxy', 1)` when running behind the HTTPS
proxy. Prefer the one-origin proxy architecture for temporary tests.

### ngrok Configuration File

An optional `ngrok.yml` can define both local tunnels:

```yaml
version: '2'
tunnels:
  frontend:
    proto: http
    addr: 5173
  api:
    proto: http
    addr: 8787
```

Start both tunnels with:

```bash
ngrok start --all
```

Random ngrok URLs can change. Update Google OAuth redirect URIs and environment
variables whenever the public URL changes.

Public testing rules:

- Use only Google OAuth Test Users.
- Never expose Google credentials or `.env.local` through the tunnel.
- Never log access tokens or refresh tokens.
- Do not expose port 8787 directly when a reverse proxy is available.
- Do not treat the ngrok URL as a stable production URL.
- Stop the tunnel after testing.

## 14. VPS Production Direction

Recommended production layout:

```text
app.example.com -> Caddy -> /opt/member-credits/dist
api.example.com -> Caddy -> 127.0.0.1:8787
```

Use:

- Ubuntu 24.04 LTS or newer.
- A non-root deployment user.
- Node.js 22 LTS.
- systemd for the Node API.
- Caddy for HTTPS and reverse proxy.
- PostgreSQL for users, sessions, connections, roster, and events.
- Redis or PostgreSQL session storage.
- Per-user YouTube connection records.
- Persistent encrypted refresh tokens.
- Per-channel live event workers.
- Native OBS pairing and device tokens.

Before public multi-user launch, complete these changes:

- Replace Express MemoryStore.
- Remove global `latestTokens` state.
- Remove global live monitor state.
- Store user and channel data per account.
- Add authentication and authorization to native API endpoints.
- Add native pairing, revocation, and disconnect flows.
- Add rate limiting.
- Restrict CORS to the real frontend origin.
- Enable secure cookies behind HTTPS.
- Validate OAuth state and callback failures.
- Add database backups and rollback procedures.
- Keep credentials and environment files outside the repository and web root.

The existing `PRODUCTION_SETUP.md` contains the detailed systemd and Caddy
procedure.

## 15. Verification Checklist

After web changes:

```bash
npm run format:check
npm run build
node --check server/index.mjs
```

After native changes:

```bash
cmake --build obs-plugin/build -j$(nproc)
cmake --install obs-plugin/build \
  --prefix "$HOME/.config/obs-studio/plugins/member-credits"
```

Manually verify:

- Dashboard opens locally.
- `/health` returns `ok: true`.
- OAuth redirects to the configured callback.
- YouTube connection status is displayed.
- Member import preserves names and tiers.
- Native roster export contains UTF-8 member names.
- Credit roll renders correctly.
- Bottom ticker contains names only.
- Left, center/middle, and right alignment work.
- Play, Pause, Stop, Reset, Reload roster, and Connect YouTube work.
- Transparent background does not create an unexpected full-screen fill.
- Mobile dashboard has no horizontal overflow.
- OBS loads the native plugin without a crash.

## 16. AI Operating Rules

An AI working on this repository must:

- Read this file, `LOCAL_SETUP.md`, and the relevant source files first.
- Never read, print, or commit secret values from `.env.local`.
- Never replace user changes in unrelated files.
- Preserve the local/native separation unless a native pairing feature is
  explicitly being implemented.
- Treat public ngrok exposure as temporary test infrastructure.
- Do not claim production readiness while in-memory state and localhost API
  assumptions remain.
- Run the relevant web and native verification commands after code changes.
- Report any public deployment limitation explicitly.
