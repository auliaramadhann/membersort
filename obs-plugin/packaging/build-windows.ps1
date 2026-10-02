[CmdletBinding()]
param(
    [string] $ObsSourceDir = $env:OBS_SOURCE_DIR,
    [string] $ObsInstallDir = $env:OBS_INSTALL_DIR,
    [string] $BuildDir = "",
    [ValidateSet("Debug", "RelWithDebInfo", "Release", "MinSizeRel")]
    [string] $Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$PackagingDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginRoot = Resolve-Path (Join-Path $PackagingDir "..")

if ([string]::IsNullOrWhiteSpace($BuildDir)) {
    $BuildDir = Join-Path $PluginRoot "build-windows"
}
if ([string]::IsNullOrWhiteSpace($ObsSourceDir) -or [string]::IsNullOrWhiteSpace($ObsInstallDir)) {
    throw "Set OBS_SOURCE_DIR and OBS_INSTALL_DIR to a compatible OBS SDK/source build."
}

$ConfigureArgs = @(
    "-S", $PluginRoot,
    "-B", $BuildDir,
    "-G", "Visual Studio 17 2022",
    "-A", "x64",
    "-DCMAKE_BUILD_TYPE=$Configuration",
    "-DOBS_SOURCE_DIR=$ObsSourceDir",
    "-DOBS_INSTALL_DIR=$ObsInstallDir"
)
if ($env:CMAKE_PREFIX_PATH) {
    $ConfigureArgs += "-DCMAKE_PREFIX_PATH=$env:CMAKE_PREFIX_PATH"
}

cmake @ConfigureArgs
cmake --build $BuildDir --config $Configuration --parallel
cmake --install $BuildDir --config $Configuration --prefix (Join-Path $BuildDir "stage")

Write-Host "Windows plugin build completed in $BuildDir"
