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

$versionType = $version.ToLower()

# repository
npm version --no-git-tag-version $versionType

# protocol
Set-Location protocol
npm version --no-git-tag-version $versionType

# server
Set-Location ../server
npm version --no-git-tag-version $versionType

# client
Set-Location ../client
npm version --no-git-tag-version $versionType
