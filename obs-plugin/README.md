# Member Credits OBS Plugin

Native OBS source for the Member Credits project.

## Current status

This is the first cross-platform native prototype. It registers a `Member
Credits` source, exposes native OBS properties, resets when the source becomes
visible, renders title/tier/member/footer text with FreeType, and runs a
vertical credit-roll or bottom ticker animation. Text alignment supports left,
center/middle, and right. The source can load a UTF-8 roster text file exported
by the authenticated dashboard; the ticker uses all member names and omits tier
headers.

The plugin is intentionally separate from the React dashboard and YouTube API
server.

## Test with real YouTube members

The native integration uses a short-lived device token and keeps Google OAuth
tokens in the API server. The plugin only receives the roster over HTTPS.

1. Start the API and dashboard with `npm run dev:server` and `npm run dev`, or
   deploy them behind the public Nginx/ngrok origin.
2. Open the native source properties in OBS.
3. Set `Public API URL` to the API/dashboard origin.
4. Click `Connect YouTube` and complete OAuth in the browser.
5. The plugin pairs with that browser session and refreshes its local render.

For local development, `Public API URL` may remain `http://localhost:8787`.
For a VPS test, use the HTTPS ngrok URL. The plugin stores only a device token,
not a Google access or refresh token.

The file format is one tier per block:

```text
[Gold Members]
Alice
Bob
```

The native source keeps the manual roster as a fallback when no roster file is
selected or the file cannot be read.

## Build requirements

- CMake 3.20 or newer.
- C++17 compiler.
- OBS development headers and library.
- libcurl development headers and library.

The current development machine does not have CMake or OBS development files
installed, so native compilation must currently be performed on a machine with
the OBS SDK or through the project CI build.

## Configure

If OBS is installed with development files discoverable by CMake:

```bash
cmake -S . -B build
cmake --build build
```

Otherwise provide the OBS source and install locations:

```bash
cmake \
  -S . \
  -B build \
  -DOBS_SOURCE_DIR=/path/to/obs \
  -DOBS_INSTALL_DIR=/path/to/obs/install
cmake --build build
```

## Manual package layout

The eventual release artifacts are separate per operating system:

```text
member-credits-windows-x64.zip
member-credits-macos-universal.zip
member-credits-linux-x64.zip
```

Each archive will contain a plugin folder with `bin/` and `data/` directories.
For Linux, the user can extract the folder into
`~/.config/obs-studio/plugins/`. For Windows, the package follows the modern
ProgramData plugin layout. macOS uses a `.plugin` bundle.

## Development milestones

1. Verify plugin loading on Linux, Windows, and macOS.
2. Verify source properties persistence in a scene collection.
3. Implement native text and tier rendering.
4. Implement Play, Pause, Stop, and scene visibility reset.
5. Add persistent per-user storage and device revocation for production.
