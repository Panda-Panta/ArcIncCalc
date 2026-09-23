$ErrorActionPreference = "Stop"

Write-Host ">>> Ensuring running instances of R.I.I.C-Calculator are closed before sync..."
Get-Process "R.I.I.C-Calculator", "ArcIncCalc" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

Write-Host ">>> Building Vue 3 Frontend (npm run build)..."
npm run build

$targetSyncDir = if (Test-Path "D:\Tools\R.I.I.C-Calculator") { "D:\Tools\R.I.I.C-Calculator" } elseif (Test-Path "D:\Tools\ArcIncCalc") { "D:\Tools\ArcIncCalc" } else { "D:\Tools\R.I.I.C-Calculator" }
if (Test-Path $targetSyncDir) {
    Write-Host ">>> Syncing dist assets into $targetSyncDir\dist..."
    robocopy dist "$targetSyncDir\dist" /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

    Write-Host ">>> Publishing .NET Desktop Runner (win-x64 single file)..."
    dotnet publish desktop/R.I.I.C-Calculator.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -o "$targetSyncDir"
    Remove-Item "$targetSyncDir/*.pdb", "$targetSyncDir/*.xml" -Force -ErrorAction SilentlyContinue
    Copy-Item "desktop/README.txt" "$targetSyncDir/README.txt" -Force

    Write-Host "Successfully synced full application (exe + dist) to $targetSyncDir."
} else {
    Write-Warning "$targetSyncDir directory not found."
}
