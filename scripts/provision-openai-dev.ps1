# Provision Azure OpenAI for Wander dev and wire it to the API App Service + Key Vault.
#
# Requires: Azure CLI logged in WITH MFA step-up for resource writes. A normal `az login` is often
# enough for read-only calls, but create/update/delete needs a second sign-in (claims challenge).
#
# Usage (from repo root):
#   az login
#   .\scripts\provision-openai-dev.ps1
#
# If the script stops for MFA, it prints the exact `az login --claims-challenge ...` command.
# Complete MFA in the browser, then re-run this script (no need to log out first).
#
# Optional env overrides:
#   $env:WANDER_OPENAI_NAME = "oai-wander-dev-azgnto"
#
# If az login hangs in VS Code terminal (browser popup never returns), run with -Login:
#   .\scripts\provision-openai-dev.ps1 -Login
# That uses device-code MFA (https://login.microsoft.com/device + a short code) instead of the
# embedded browser flow. Run ONE command at a time — do not paste login + script on the same line.

param(
  [switch]$Login
)

$ErrorActionPreference = "Stop"

$rg = "rg-wander-dev"
$location = "eastus2"
$tenantId = "c37d0d41-1d23-42ec-b2a9-142f6013c9c5"
$accountName = if ($env:WANDER_OPENAI_NAME) { $env:WANDER_OPENAI_NAME } else { "oai-wander-dev-azgnto" }
$appName = "app-wander-dev-azgnto"
$kvName = "kv-wndr-dev-azgnto"
$chatDeployment = "gpt-4o"
$draftDeployment = "gpt-4o-mini"

# Azure prints this when MFA step-up is required; we reuse it in preflight + error handling.
$claimsChallenge = "eyJhY2Nlc3NfdG9rZW4iOnsiYWNycyI6eyJlc3NlbnRpYWwiOnRydWUsInZhbHVlcyI6WyJwMSJdfX19"

function Write-MfaInstructions {
  param([string]$Context = "create or update Azure resources")
  Write-Host ""
  Write-Host "MFA step-up required before we can ${Context}." -ForegroundColor Yellow
  Write-Host "Easiest in VS Code terminal - rerun this script with -Login (device code, no hang):" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  .\scripts\provision-openai-dev.ps1 -Login" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Or manually (device code - paste the code at https://login.microsoft.com/device):" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  az login --tenant `"$tenantId`" --scope `"https://management.core.windows.net//.default`" --claims-challenge `"$claimsChallenge`" --use-device-code" -ForegroundColor Cyan
  Write-Host ""
}

function Invoke-MfaDeviceLogin {
  Write-Host "==> MFA device-code login (open https://login.microsoft.com/device and enter the code below)..."
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & az login `
    --tenant $tenantId `
    --scope "https://management.core.windows.net//.default" `
    --claims-challenge $claimsChallenge `
    --use-device-code
  $exit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($exit -ne 0) { throw "Azure login failed or was cancelled." }
  Write-Host "==> Login succeeded."
}

function Get-JwtPayload {
  param([string]$Jwt)
  $parts = $Jwt.Split(".")
  if ($parts.Count -lt 2) { return $null }
  $payload = $parts[1]
  # Base64url → Base64
  $payload = $payload.Replace("-", "+").Replace("_", "/")
  switch ($payload.Length % 4) {
    0 { break }
    2 { $payload += "=="; break }
    3 { $payload += "="; break }
    default { return $null }
  }
  try {
    $bytes = [Convert]::FromBase64String($payload)
    return [System.Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Test-ManagementMfaReady {
  # Best-effort: a management token with acrs=p1 usually means MFA step-up already happened.
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $raw = az account get-access-token --resource "https://management.core.windows.net/" -o json 2>$null
  $ErrorActionPreference = $prevEap
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) { return $false }
  try {
    $tok = ($raw | ConvertFrom-Json).accessToken
    $payload = Get-JwtPayload -Jwt $tok
    if ($null -eq $payload) { return $false }
    $acrs = [string]$payload.acrs
    return ($acrs -match "p1")
  } catch {
    return $false
  }
}

function Invoke-AzChecked {
  param(
    [string[]]$AzArgs,
    [string]$FailureMessage
  )
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = & az @AzArgs 2>&1
  $exit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  $text = ($out | Out-String).Trim()
  if ($exit -ne 0) {
    if ($text -match "claims-challenge|MFAforAzure|RequestDisallowedByAzure") {
      Write-MfaInstructions
    }
    if ($text) { Write-Host $text -ForegroundColor Red }
    throw $FailureMessage
  }
  return $text
}

if ($Login) {
  Invoke-MfaDeviceLogin
}

Write-Host "==> Checking Azure CLI login..."
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$acctJson = az account show -o json 2>$null
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($acctJson)) {
  Write-Host "Not logged in. Run: az login" -ForegroundColor Yellow
  throw "Azure CLI is not logged in."
}
$acct = $acctJson | ConvertFrom-Json
Write-Host "    subscription: $($acct.name) ($($acct.id))"
Write-Host "    tenant:       $($acct.tenantId)"
if ($acct.tenantId -ne $tenantId) {
  Write-Host "    warning: expected tenant $tenantId (Wander dev). Wrong tenant can cause MFA/RBAC issues." -ForegroundColor Yellow
}

if (-not (Test-ManagementMfaReady)) {
  Write-MfaInstructions -Context "provision Azure OpenAI"
  throw "MFA step-up not detected on the current Azure CLI session. Run the login command above, then re-run this script."
}

Write-Host "==> Ensuring resource group $rg exists..."
Invoke-AzChecked -AzArgs @("group", "show", "-n", $rg, "-o", "none") -FailureMessage "Resource group $rg not found. Deploy Phase 3 infra first."

$ErrorActionPreference = "Continue"
$existingJson = az cognitiveservices account show -g $rg -n $accountName -o json 2>$null
$ErrorActionPreference = "Stop"
$accountExists = ($LASTEXITCODE -eq 0) -and (-not [string]::IsNullOrWhiteSpace($existingJson))

if (-not $accountExists) {
  Write-Host "==> Creating Azure OpenAI account $accountName in $location..."
  Invoke-AzChecked -AzArgs @(
    "cognitiveservices", "account", "create",
    "--name", $accountName,
    "--resource-group", $rg,
    "--kind", "OpenAI",
    "--sku", "S0",
    "--location", $location,
    "--custom-domain", $accountName,
    "--yes"
  ) -FailureMessage "Failed to create OpenAI account ${accountName}."
} else {
  Write-Host "==> OpenAI account ${accountName} already exists - skipping create."
}

function Ensure-Deployment {
  param(
    [string]$Name,
    [string]$ModelName,
    [string]$ModelVersion
  )
  $ErrorActionPreference = "Continue"
  $dep = az cognitiveservices account deployment show -g $rg -n $accountName --deployment-name $Name -o json 2>$null
  $ErrorActionPreference = "Stop"
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($dep)) {
    Write-Host "    deployment $Name already exists"
    return
  }
  Write-Host "    creating deployment $Name ($ModelName)..."
  Invoke-AzChecked -AzArgs @(
    "cognitiveservices", "account", "deployment", "create",
    "--name", $accountName,
    "--resource-group", $rg,
    "--deployment-name", $Name,
    "--model-name", $ModelName,
    "--model-version", $ModelVersion,
    "--model-format", "OpenAI",
    "--sku-capacity", "10",
    "--sku-name", "Standard"
  ) -FailureMessage "Failed to create deployment $Name"
}

Write-Host "==> Ensuring model deployments..."
Ensure-Deployment -Name $draftDeployment -ModelName "gpt-4.1-mini" -ModelVersion "2025-04-14"
Ensure-Deployment -Name $chatDeployment -ModelName "gpt-4o" -ModelVersion "2024-11-20"

$endpoint = az cognitiveservices account show -g $rg -n $accountName --query "properties.endpoint" -o tsv
$key = az cognitiveservices account keys list -g $rg -n $accountName --query "key1" -o tsv
if (-not $endpoint -or -not $key) { throw "Could not read endpoint/key from $accountName" }

Write-Host "==> Writing Ai--ApiKey to Key Vault $kvName..."
$kvWritten = $false
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$kvOut = az keyvault secret set --vault-name $kvName --name "Ai--ApiKey" --value $key 2>&1
$kvExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($kvExit -eq 0) {
  $kvWritten = $true
  Write-Host "    Key Vault secret updated."
} else {
  Write-Host "    Key Vault write skipped (RBAC: need Key Vault Secrets Officer on $kvName)." -ForegroundColor Yellow
  if ($kvOut) { Write-Host "    $($kvOut | Out-String)" -ForegroundColor DarkYellow }
}

Write-Host "==> Updating App Service $appName settings..."
Invoke-AzChecked -AzArgs @(
  "webapp", "config", "appsettings", "set",
  "-g", $rg, "-n", $appName, "--settings",
  "Ai__Endpoint=$endpoint",
  "Ai__ChatDeployment=$chatDeployment",
  "Ai__DraftDeployment=$draftDeployment",
  "Ai__DailyTokenLimit=50000"
) -FailureMessage "Failed to update App Service AI settings."

if ($kvWritten) {
  $kvRef = "@Microsoft.KeyVault(SecretUri=https://${kvName}.vault.azure.net/secrets/Ai--ApiKey)"
  # Windows cmd.exe breaks on parentheses in --settings; use a JSON settings file.
  $settingsFile = Join-Path $env:TEMP "wander-ai-keyvault-ref.json"
  @(@{ name = "Ai__ApiKey"; value = $kvRef }) | ConvertTo-Json | Set-Content -Path $settingsFile -Encoding utf8
  try {
    Invoke-AzChecked -AzArgs @(
      "webapp", "config", "appsettings", "set",
      "-g", $rg, "-n", $appName, "--settings", "@$settingsFile"
    ) -FailureMessage "Failed to set Ai__ApiKey Key Vault reference on App Service."
  } finally {
    Remove-Item -Path $settingsFile -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host "    Setting Ai__ApiKey directly on App Service (dev fallback; re-run after KV RBAC is granted to use a vault reference)." -ForegroundColor Yellow
  Invoke-AzChecked -AzArgs @(
    "webapp", "config", "appsettings", "set",
    "-g", $rg, "-n", $appName, "--settings",
    "Ai__ApiKey=$key"
  ) -FailureMessage "Failed to set Ai__ApiKey on App Service."
}

Write-Host "==> Restarting App Service..."
Invoke-AzChecked -AzArgs @("webapp", "restart", "-g", $rg, "-n", $appName) -FailureMessage "Failed to restart App Service."

Write-Host ""
Write-Host "Done. Azure OpenAI is wired to the dev API." -ForegroundColor Green
Write-Host "  Endpoint:    $endpoint"
Write-Host "  Deployments: $chatDeployment, $draftDeployment"
Write-Host ""
Write-Host "Optional - persist for CI deploys (GitHub Environment dev secrets):"
Write-Host "  gh auth login"
Write-Host "  .\scripts\set-github-ai-secrets.ps1"
Write-Host ""
$verifyUrl = "https://${appName}.azurewebsites.net/api/ai/status"
Write-Host "Verify: GET $verifyUrl (with auth) should return enabled: true"
