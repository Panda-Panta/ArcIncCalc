$ErrorActionPreference = "Stop"

Write-Host ">>> Building Vue 3 Frontend (npm run build)..."
npm run build

$targetSyncDir = "D:\Tools\ArcIncCalc"
if (Test-Path $targetSyncDir) {
    Write-Host ">>> Syncing dist assets into $targetSyncDir\dist..."
    robocopy dist "$targetSyncDir\dist" /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

    Write-Host ">>> Publishing .NET Desktop Runner (win-x64 single file)..."
    dotnet publish desktop/ArcIncCalc.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -o "$targetSyncDir"
    Remove-Item "$targetSyncDir/*.pdb", "$targetSyncDir/*.xml" -Force -ErrorAction SilentlyContinue
    Copy-Item "desktop/README.txt" "$targetSyncDir/README.txt" -Force

    Write-Host "Successfully synced full application (exe + dist) to $targetSyncDir."
} else {
    Write-Warning "$targetSyncDir directory not found."
}
