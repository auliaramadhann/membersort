#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPOSITORY_ROOT="$(cd "${PLUGIN_ROOT}/.." && pwd)"
BUILD_DIR="${BUILD_DIR:-${PLUGIN_ROOT}/build-release}"
RELEASE_DIR="${RELEASE_DIR:-${REPOSITORY_ROOT}/releases}"
PACKAGE_NAME="member-credits-linux-x64"
PACKAGE_ROOT="${RELEASE_DIR}/${PACKAGE_NAME}"
PLUGIN_PACKAGE="${PACKAGE_ROOT}/member-credits"
ARCHIVE_PATH="${RELEASE_DIR}/${PACKAGE_NAME}.zip"
read -r -a CMAKE_EXTRA_ARGS_ARRAY <<< "${CMAKE_EXTRA_ARGS:-}"

mkdir -p "${RELEASE_DIR}"
rm -rf "${PACKAGE_ROOT}" "${ARCHIVE_PATH}"

cmake -S "${PLUGIN_ROOT}" -B "${BUILD_DIR}" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release "${CMAKE_EXTRA_ARGS_ARRAY[@]}"
cmake --build "${BUILD_DIR}" --parallel
cmake --install "${BUILD_DIR}" --prefix "${PLUGIN_PACKAGE}"

BINARY_PATH="${PLUGIN_PACKAGE}/bin/64bit/member-credits.so"
if [[ ! -f "${BINARY_PATH}" ]]; then
  printf 'Missing Linux plugin binary: %s\n' "${BINARY_PATH}" >&2
  exit 1
fi

if command -v ldd >/dev/null 2>&1; then
  if ldd "${BINARY_PATH}" | grep -F 'not found' >/dev/null; then
    ldd "${BINARY_PATH}" >&2
    printf 'The Linux plugin has unresolved shared-library dependencies.\n' >&2
    exit 1
  fi
fi

cat > "${PLUGIN_PACKAGE}/INSTALL.txt" <<'EOF'
Member Credits OBS Plugin - Ubuntu x64

1. Close OBS Studio.
2. Copy the member-credits folder into:

   ~/.config/obs-studio/plugins/

3. Start OBS Studio.
4. Add a source named Member Credits.
5. Set Public API URL in the source properties.
6. Click Connect YouTube.

This package expects OBS Studio, libcurl, and FreeType to be installed by the
Ubuntu system. It must be used on a compatible x86_64 Ubuntu/OBS installation.
EOF

cat > "${PLUGIN_PACKAGE}/DEPENDENCIES.txt" <<'EOF'
Runtime dependencies:

- OBS Studio with a compatible libobs ABI.
- libcurl.
- FreeType 2.

The package intentionally does not include libobs. libobs must come from the
installed OBS Studio version.
EOF

(cd "${PACKAGE_ROOT}" && zip -qr "${ARCHIVE_PATH}" member-credits)
printf 'Created %s\n' "${ARCHIVE_PATH}"
