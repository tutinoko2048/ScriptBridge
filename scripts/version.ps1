# update each package versions in the project
# args: {version: string}

# Loop package.json, server/package.json, client/package.json protocol/package.json

param(
    [string]$version
)

if (-not $version) {
    Write-Host "Please provide a version number or type: major, minor, patch" -ForegroundColor Red
    exit 1
}

# get this file's directory
$path = $PSScriptRoot

$versionType = $version.ToLower()

# repository
Set-Location $path/..
npm version --no-git-tag-version --workspaces --include-workspace-root $versionType
