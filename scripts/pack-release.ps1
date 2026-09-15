$ErrorActionPreference = "Stop"

Write-Host ">>> [1/5] Building Vue 3 Frontend (npm run build)..."
npm run build

Write-Host ">>> [2/5] Publishing .NET Desktop Runner (win-x64 single file)..."
if (Test-Path "release/ArcIncCalc") {
    Remove-Item -Recurse -Force "release/ArcIncCalc"
}
dotnet publish desktop/ArcIncCalc.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -o release/ArcIncCalc

Write-Host ">>> [3/5] Syncing dist assets into release folder..."
robocopy dist release/ArcIncCalc/dist /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

Write-Host ">>> [4/5] Copying instructions and cleaning..."
Copy-Item "desktop/README.txt" "release/ArcIncCalc/README.txt" -Force
Remove-Item release/ArcIncCalc/*.pdb, release/ArcIncCalc/*.xml -Force -ErrorAction SilentlyContinue

Write-Host ">>> [5/5] Compressing portable ZIP archive..."
$zipPath = "../ArcIncCalc-Windows-x64-Portable.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
tar.exe -a -cf $zipPath -C release ArcIncCalc

$exeItem = Get-Item "release/ArcIncCalc/ArcIncCalc.exe"
$zipItem = Get-Item $zipPath

Write-Host "Done!"
Write-Host "Exe path: release/ArcIncCalc/ArcIncCalc.exe"
Write-Host "Exe size: $([math]::Round($exeItem.Length / 1KB, 1)) KB"
Write-Host "Zip path: $zipPath"
Write-Host "Zip size: $([math]::Round($zipItem.Length / 1MB, 1)) MB"
