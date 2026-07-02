# Publishes a new lab/workshop content patch to every known player's own S3 mailbox
# (<player_id>/content/), so already-installed centralized-mode apps pick it up on next
# launch without a new app release. See issue #47 / designs plan.
#
# What it does:
#   1. Scans the player-version DynamoDB table for every known player_id.
#   2. Uploads the content JSON files (already edited/regenerated in src/main/resources)
#      plus a manifest.json carrying the new -ContentVersion to each player's
#      <player_id>/content/ folder.
#
# Each client's ContentPatchService downloads and applies the patch, then deletes the
# objects from its own folder - this is a one-shot mailbox, not a standing feed, so
# re-running this script is how you "push again" (it just re-delivers to everyone).
#
# Prerequisites:
#   - AWS CLI installed and on PATH, with credentials that can scan the DynamoDB table
#     and write to the S3 bucket (your own account credentials - NOT the per-player
#     vended role, which has no access outside its own player_id prefix).
#
# Usage:
#   .\scripts\publish-content.ps1 -ContentVersion 3
#   .\scripts\publish-content.ps1 -ContentVersion 3 -Bucket my-bucket -Table my-table

param(
    [Parameter(Mandatory = $true)]
    [int]$ContentVersion,

    [string]$Bucket    = "tower-analyzer-reports-prod-611434859239",
    [string]$Table     = "TowerAnalyzerPlayerVersion-prod",
    [string]$Region    = "us-east-2",
    [string]$SourceDir = (Join-Path (Split-Path $PSScriptRoot) "src\main\resources")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$contentFiles = @(
    "lab_definitions.json",
    "lab_costs.json",
    "workshop_definitions.json",
    "workshop_costs.json",
    "workshop_plus_costs.json",
    "workshop_values.json",
    "enhancement_values.json"
)

foreach ($file in $contentFiles) {
    $path = Join-Path $SourceDir $file
    if (-not (Test-Path $path)) {
        throw "Missing content file: $path"
    }
}

Write-Host "Scanning $Table ($Region) for known player IDs..."
$scanJson = aws dynamodb scan `
    --table-name $Table `
    --region $Region `
    --projection-expression "player_id" `
    --output json
$scan = $scanJson | ConvertFrom-Json
$playerIds = $scan.Items | ForEach-Object { $_.player_id.S } | Where-Object { $_ }

if (-not $playerIds -or $playerIds.Count -eq 0) {
    Write-Host "No known players found - nothing to publish."
    exit 0
}
Write-Host "Found $($playerIds.Count) player(s)."

$manifestPath = Join-Path $env:TEMP "content-manifest-$ContentVersion.json"
# Windows PowerShell 5.1's -Encoding utf8 writes a BOM, which Jackson rejects when parsing
# the manifest on the client. Write plain UTF-8 without a BOM instead.
$manifestJson = "{`"contentVersion`":$ContentVersion}"
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, (New-Object System.Text.UTF8Encoding($false)))

$count = 0
foreach ($playerId in $playerIds) {
    $prefix = "s3://$Bucket/$playerId/content/"
    aws s3 cp $manifestPath "${prefix}manifest.json" --region $Region | Out-Null
    foreach ($file in $contentFiles) {
        $path = Join-Path $SourceDir $file
        aws s3 cp $path "$prefix$file" --region $Region | Out-Null
    }
    $count++
    Write-Host "  Published v$ContentVersion to $playerId"
}

Remove-Item $manifestPath -Force

Write-Host ""
Write-Host "Done. Published content v$ContentVersion to $count player(s)."
