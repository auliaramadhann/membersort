# OBS Addon Packaging

Native packages are built separately for each platform. Do not combine Windows
and Linux binaries in one archive.

The package root must be a folder named `member-credits` with this structure:

```text
member-credits/
├── bin/64bit/member-credits.so or member-credits.dll
└── data/locale/en-US.ini
```

Windows packages may also contain FreeType/libcurl runtime DLLs in
`bin/64bit`. Do not copy OBS core DLLs into the package because they must match
the user's installed OBS version.

## Build Ubuntu Bundle

From the repository root:

```bash
chmod +x obs-plugin/packaging/package-linux.sh
obs-plugin/packaging/package-linux.sh
```

Output:

```text
releases/member-credits-linux-x64.zip
```

The Ubuntu package expects a compatible OBS installation plus system `libcurl`
and FreeType libraries. `libobs` is intentionally not bundled.

## Build Windows Bundle

Use a Windows x64 machine with Visual Studio 2022, CMake, a compatible OBS SDK
build, FreeType, and libcurl development packages.

Set these variables in PowerShell:

```powershell
$env:OBS_SOURCE_DIR = 'C:\path\to\obs-studio'
$env:OBS_INSTALL_DIR = 'C:\path\to\obs-install'
$env:OBS_PLUGIN_RUNTIME_DIRS = 'C:\path\to\freetype\bin;C:\path\to\curl\bin'
```

Build and package:

```powershell
.\obs-plugin\packaging\build-windows.ps1
.\obs-plugin\packaging\package-windows.ps1 `
  -RuntimeDirs ($env:OBS_PLUGIN_RUNTIME_DIRS -split ';')
```

Output:

```text
releases\member-credits-windows-x64.zip
```

The Windows package must not include OBS core DLLs from a different OBS
installation.

## GitHub Actions

The repository includes `.github/workflows/package-obs-plugin.yml`.

The Ubuntu job builds a bundle directly on `ubuntu-24.04`. The Windows job is
manual because OBS Windows development files are not installed on a normal
runner. To run it, provide a ZIP through the `windows_sdk_url` workflow input
with this layout:

```text
source/    OBS source tree used for headers
install/   OBS install tree containing libobs import libraries and CMake files
runtime/   FreeType/libcurl runtime DLLs
```

The optional `windows_sdk_sha256` input verifies the downloaded SDK before it
is used. The workflow uploads the Windows ZIP as an Actions artifact.
