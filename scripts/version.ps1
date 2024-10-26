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
npm version --no-git-tag-version $versionType

# protocol
Set-Location $path/../protocol
npm version --no-git-tag-version $versionType

# server
Set-Location $path/../server
npm version --no-git-tag-version $versionType

# client
Set-Location $path/../client
npm version --no-git-tag-version $versionType
