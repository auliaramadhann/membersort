[CmdletBinding()]
param(
    [string] $BuildDir = "",
    [string] $ReleaseDir = "",
    [string[]] $RuntimeDirs = @(),
    [ValidateSet("Debug", "RelWithDebInfo", "Release", "MinSizeRel")]
    [string] $Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$PackagingDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginRoot = Resolve-Path (Join-Path $PackagingDir "..")
$RepositoryRoot = Resolve-Path (Join-Path $PluginRoot "..")

if ([string]::IsNullOrWhiteSpace($BuildDir)) {
    $BuildDir = Join-Path $PluginRoot "build-windows"
}
if ([string]::IsNullOrWhiteSpace($ReleaseDir)) {
    $ReleaseDir = Join-Path $RepositoryRoot "releases"
}

$PackageName = "member-credits-windows-x64"
$PackageRoot = Join-Path $ReleaseDir $PackageName
$PluginPackage = Join-Path $PackageRoot "member-credits"
$BinaryDir = Join-Path $PluginPackage "bin/64bit"
$ArchivePath = Join-Path $ReleaseDir "$PackageName.zip"

New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $PackageRoot
Remove-Item -Force -ErrorAction SilentlyContinue $ArchivePath

$Candidates = @(
    (Join-Path $BuildDir "$Configuration/member-credits.dll"),
    (Join-Path $BuildDir "member-credits.dll"),
    (Join-Path $BuildDir "bin/64bit/member-credits.dll"),
    (Join-Path $BuildDir "stage/bin/64bit/member-credits.dll")
)
$PluginBinary = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($PluginBinary)) {
    throw "member-credits.dll was not found. Build the plugin first or pass -BuildDir."
}

New-Item -ItemType Directory -Force -Path $BinaryDir | Out-Null
$DataSource = Join-Path $PluginRoot "data"
Copy-Item -Recurse -Force $DataSource (Join-Path $PluginPackage "data")
Copy-Item -Force $PluginBinary (Join-Path $BinaryDir "member-credits.dll")

if ($RuntimeDirs.Count -eq 0 -and $env:OBS_PLUGIN_RUNTIME_DIRS) {
    $RuntimeDirs = $env:OBS_PLUGIN_RUNTIME_DIRS -split ';'
}

$RuntimePatterns = @(
    "freetype*.dll",
    "libcurl*.dll",
    "zlib*.dll",
    "brotli*.dll",
    "libssl*.dll",
    "libcrypto*.dll",
    "nghttp2*.dll",
    "libssh2*.dll",
    "libidn2*.dll",
    "libpsl*.dll",
    "libunistring*.dll",
    "zstd*.dll"
)
$CopiedRuntimeNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($RuntimeDir in $RuntimeDirs) {
    if (-not (Test-Path $RuntimeDir)) { continue }
    foreach ($Pattern in $RuntimePatterns) {
        Get-ChildItem -Path $RuntimeDir -Filter $Pattern -File -Recurse -ErrorAction SilentlyContinue |
            ForEach-Object {
                if ($CopiedRuntimeNames.Add($_.Name)) {
                    Copy-Item -Force $_.FullName (Join-Path $BinaryDir $_.Name)
                }
            }
    }
}

@"
Member Credits OBS Plugin - Windows x64

1. Close OBS Studio.
2. Copy the member-credits folder into one of these locations:

   Per-user:    %APPDATA%\\obs-studio\\plugins\\
   All users:   %PROGRAMDATA%\\obs-studio\\plugins\\

3. Start OBS Studio.
4. Add a source named Member Credits.
5. Set Public API URL in the source properties.
6. Click Connect YouTube.

The package is x64 and requires a compatible 64-bit OBS Studio installation.
"@ | Set-Content -Encoding UTF8 (Join-Path $PluginPackage "INSTALL.txt")

@"
The plugin binary links against OBS/libobs, FreeType, and libcurl.
OBS/libobs is intentionally supplied by the installed OBS Studio version.
The package script copies FreeType/libcurl runtime DLLs from -RuntimeDirs when
they are available. Do not copy an OBS core DLL from another OBS installation.
"@ | Set-Content -Encoding UTF8 (Join-Path $PluginPackage "DEPENDENCIES.txt")

Compress-Archive -Path (Join-Path $PackageRoot "member-credits") -DestinationPath $ArchivePath -CompressionLevel Optimal
Write-Host "Created $ArchivePath"
