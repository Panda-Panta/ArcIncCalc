$ErrorActionPreference = "Stop"

Write-Host ">>> Building Vue 3 Frontend (npm run build)..."
npm run build

$targetSyncDist = "D:\Tools\ArcIncCalc\dist"
if (Test-Path "D:\Tools\ArcIncCalc") {
    Write-Host ">>> Syncing dist assets into $targetSyncDist..."
    robocopy dist $targetSyncDist /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    Write-Host "Successfully synced frontend to D:\Tools\ArcIncCalc\dist."
} else {
    Write-Warning "D:\Tools\ArcIncCalc directory not found."
}
