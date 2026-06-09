# Push Azure OpenAI endpoint + API key to GitHub Environment secrets (dev).
# Requires: gh auth login, Azure CLI logged in.
#
# Usage:
#   gh auth login
#   .\scripts\set-github-ai-secrets.ps1

$ErrorActionPreference = "Stop"

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
  $portable = Join-Path $env:TEMP "gh-portable\bin\gh.exe"
  if (Test-Path $portable) { $gh = Get-Command $portable }
}
if (-not $gh) {
  throw "GitHub CLI (gh) not found. Install from https://cli.github.com/ then run: gh auth login"
}

& $gh.Source auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Not logged into GitHub. Run: gh auth login"
}

$endpoint = az cognitiveservices account show -g rg-wander-dev -n oai-wander-dev-azgnto --query "properties.endpoint" -o tsv
$key = az cognitiveservices account keys list -g rg-wander-dev -n oai-wander-dev-azgnto --query key1 -o tsv
if (-not $endpoint -or -not $key) {
  throw "Could not read OpenAI endpoint/key from oai-wander-dev-azgnto"
}

Write-Host "Setting WANDER_AZURE_OPENAI_ENDPOINT on GitHub environment dev..."
& $gh.Source secret set WANDER_AZURE_OPENAI_ENDPOINT --env dev --body $endpoint
if ($LASTEXITCODE -ne 0) { throw "gh secret set WANDER_AZURE_OPENAI_ENDPOINT failed" }

Write-Host "Setting WANDER_AZURE_OPENAI_API_KEY on GitHub environment dev..."
& $gh.Source secret set WANDER_AZURE_OPENAI_API_KEY --env dev --body $key
if ($LASTEXITCODE -ne 0) { throw "gh secret set WANDER_AZURE_OPENAI_API_KEY failed" }

Write-Host "Done. CI deploys will now pass AI config through Bicep to Key Vault + App Service."
