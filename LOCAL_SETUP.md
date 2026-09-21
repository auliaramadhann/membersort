# Local Setup

Panduan ini untuk menjalankan Member Credits di komputer development.

## Project Overview

Member Credits terdiri dari tiga bagian:

- React/Vite dashboard untuk mengatur credit scene.
- Node.js API untuk Google OAuth dan YouTube API.
- Native OBS plugin untuk merender credits langsung di OBS.

Struktur penting:

```text
src/App.tsx                         React dashboard dan overlay
src/styles.css                      Dashboard dan credit styling
server/index.mjs                    OAuth dan YouTube API server
obs-plugin/src/                     Native OBS source C++
obs-plugin/data/locale/             OBS source labels
obs-plugin/build/                   Native build output
```

## Requirements

Install tools berikut:

- Node.js 22 LTS atau lebih baru.
- npm.
- CMake 3.20 atau lebih baru.
- Ninja.
- C++17 compiler.
- `pkg-config`.
- OBS Studio.
- OBS development headers and library.
- FreeType development headers.

Ubuntu/Debian example:

```bash
sudo apt update
sudo apt install -y build-essential cmake ninja-build pkg-config libfreetype6-dev libobs-dev
```

Versi `libobs-dev` harus sesuai atau kompatibel dengan versi OBS yang digunakan.

## Install Project Dependencies

Run from the project root:

```bash
npm ci
```

Jangan commit file berikut:

- `.env.local`
- Google OAuth client secret JSON.
- Token atau session dump.

## Google OAuth Local Setup

1. Buka Google Cloud Console.
2. Buat atau pilih project.
3. Enable `YouTube Data API v3`.
4. Configure OAuth consent screen.
5. Pilih `External` untuk testing akun Google biasa.
6. Tambahkan akun Google sebagai Test User.
7. Buat OAuth Client ID dengan application type `Web application`.
8. Tambahkan redirect URI:

```text
http://localhost:8787/auth/google/callback
```

Download credential JSON ke lokasi di luar repository.

Create `.env.local` from the example:

```bash
cp .env.example .env.local
```

Example `.env.local`:

```dotenv
GOOGLE_CREDENTIALS_PATH=/absolute/path/to/client_secret.json
GOOGLE_REDIRECT_URI=http://localhost:8787/auth/google/callback
SESSION_SECRET=use-a-long-random-local-secret
FRONTEND_URL=http://localhost:5173
PORT=8787
```

`GOOGLE_CREDENTIALS_PATH` harus menunjuk ke file credential JSON yang benar.

## Run Web Dashboard and API

Open two terminals from the project root.

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

API health check:

```bash
curl http://localhost:8787/health
```

Expected response:

```json
{ "ok": true, "service": "member-credits-local-api" }
```

## OAuth and Real Members

From the dashboard:

1. Click `Connect YouTube`.
2. Login with the channel owner account.
3. Approve the requested YouTube scopes.
4. Confirm that the channel status becomes connected.
5. Use the member import/export controls to verify the API response.

The membership API requires an eligible channel with YouTube Memberships
enabled. OAuth success alone does not guarantee that `members.list` is
available.

The local API can fetch:

- Current members.
- Membership levels and tier names.
- Member duration metadata.
- Live direct membership events.
- Gifted membership recipients.
- Membership gifting events.

The live monitor only works while the API process is running and the channel
has an active live broadcast.

## Native OBS Plugin Build

Run from `obs-plugin/`:

```bash
cmake -S . -B build -G Ninja
cmake --build build -j$(nproc)
```

If CMake cannot find OBS, provide OBS source/install paths:

```bash
cmake \
  -S . \
  -B build \
  -G Ninja \
  -DOBS_SOURCE_DIR=/path/to/obs \
  -DOBS_INSTALL_DIR=/path/to/obs/install
cmake --build build -j$(nproc)
```

Install the plugin for the current Linux user:

```bash
cmake --install build \
  --prefix "$HOME/.config/obs-studio/plugins/member-credits"
```

Restart OBS after installing the plugin. Add a source named `Member Credits`.

Native source controls include:

- Play.
- Pause.
- Stop.
- Reset & Play.
- Connect YouTube.
- Reload roster.
- Display mode: credit roll or bottom ticker.
- Text alignment: left, center/middle, or right.
- Editable kicker, title, footer, tier, and member text.
- Optional roster text file.
- Font, colors, background, transparency, and roll duration.

The bottom ticker renders all member names from the roster in one continuous
horizontal line. Tier headers, title, kicker, and footer are not included in
ticker mode.

The Linux native roster cache path is:

```text
~/.config/obs-studio/plugin_config/member-credits/member-roster.txt
```

The native source watches this file and rebuilds the credits when its contents
change. A manually selected `Roster file` can be used as a fallback.

## Native OAuth Test

Start the API before clicking `Connect YouTube` in native OBS:

```bash
npm run dev:server
```

The native button opens:

```text
http://localhost:8787/auth/google
```

After OAuth succeeds, the API writes the current roster to the shared native
cache path. Keep the API process running while testing live membership events.

## Checks and Builds

Run web formatting and production build:

```bash
npm run format:check
npm run build
```

Check server syntax:

```bash
node --check server/index.mjs
```

Build and install native plugin:

```bash
cmake --build obs-plugin/build -j$(nproc)
cmake --install obs-plugin/build \
  --prefix "$HOME/.config/obs-studio/plugins/member-credits"
```

## Temporary Public Testing

For a temporary web test without a domain, use Cloudflare Quick Tunnel or
ngrok. A tunnel URL is temporary and should only be used with OAuth Test Users.

Cloudflare Quick Tunnel example:

```bash
cloudflared tunnel --url http://127.0.0.1:8080
```

The current dashboard still assumes a local API URL. Before exposing the web
app to another person, configure the frontend API base URL and route the
frontend, `/api`, and `/auth` through the same public origin. The current native
plugin also opens localhost and therefore is not yet a public multi-user
client.

## Troubleshooting

### OAuth redirects to an error page

Check all of the following:

- The API is running on port `8787`.
- The redirect URI exactly matches Google Cloud configuration.
- The credential JSON path is correct.
- The Google account is listed as an OAuth Test User.
- The API has the required YouTube scopes.

### OAuth succeeds but no member data appears

OAuth authentication and YouTube Membership API access are separate checks.
Inspect the API terminal for `members.list` or `membershipsLevels.list` errors.
The channel must be eligible and have memberships enabled.

### Native source still shows dummy members

Check that:

- The API process is still running.
- `member-roster.txt` exists in the plugin config directory.
- OBS has loaded the newly installed plugin.
- The source Properties point to the expected roster file.
- `Reload roster` was clicked, or the file was changed after the source was created.

### Native plugin does not appear in OBS

Check the install location:

```bash
ls "$HOME/.config/obs-studio/plugins/member-credits/bin/64bit"
```

Then check the OBS log for `member-credits plugin loaded`.

### OBS settings revert after restart

Close OBS through the normal UI. Do not use `timeout`, `kill -9`, or an abrupt
terminal close while testing scene persistence.
