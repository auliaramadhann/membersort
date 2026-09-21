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

The first native integration keeps OAuth in the existing local dashboard and
uses a plain UTF-8 text roster as the handoff. This avoids putting tokens or a
networking stack inside the native renderer.

1. Start the API and dashboard with `npm run dev:server` and `npm run dev`.
2. Connect the YouTube channel from the dashboard.
3. Use `Export native roster` in the YouTube members panel.
4. Open the native source properties in OBS.
5. Select the downloaded `member-roster.txt` as `Roster file (optional)`.
6. Click `Reload roster`.

The `Connect YouTube` button in the native source opens the same browser OAuth
flow. When the local API is configured, it writes the roster directly to the
shared OBS plugin config path, so the native source can pick up changes without
storing OAuth tokens in OBS.

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
5. Add local cached member data.
6. Connect OAuth and YouTube synchronization without exposing tokens in OBS
   source settings.
