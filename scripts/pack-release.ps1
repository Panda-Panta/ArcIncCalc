$ErrorActionPreference = "Stop"

Write-Host ">>> [1/5] Building Vue 3 Frontend (npm run build)..."
npm run build

Write-Host ">>> [2/5] Publishing .NET Desktop Runner (win-x64 single file)..."
if (Test-Path "release/R.I.I.C-Calculator") {
    Remove-Item -Recurse -Force "release/R.I.I.C-Calculator"
}
dotnet publish desktop/R.I.I.C-Calculator.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -o release/R.I.I.C-Calculator

Write-Host ">>> [3/5] Syncing dist assets into release folder..."
robocopy dist release/R.I.I.C-Calculator/dist /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

Write-Host ">>> [4/5] Copying instructions and cleaning..."
Copy-Item "desktop/README.txt" "release/R.I.I.C-Calculator/README.txt" -Force
Remove-Item release/R.I.I.C-Calculator/*.pdb, release/R.I.I.C-Calculator/*.xml -Force -ErrorAction SilentlyContinue

Write-Host ">>> [5/5] Compressing portable ZIP archive..."
$zipPath = "../R.I.I.C-Calculator-Windows-x64-Portable.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
tar.exe -a -cf $zipPath -C release R.I.I.C-Calculator

$targetSyncDir = if (Test-Path "D:\Tools\R.I.I.C-Calculator") { "D:\Tools\R.I.I.C-Calculator" } elseif (Test-Path "D:\Tools\ArcIncCalc") { "D:\Tools\ArcIncCalc" } else { "" }
if ($targetSyncDir -ne "") {
    Write-Host ">>> [6/6] Syncing release to $targetSyncDir..."
    robocopy release/R.I.I.C-Calculator "$targetSyncDir" /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    Write-Host "Synced to $targetSyncDir successfully."
}

$exeItem = Get-Item "release/R.I.I.C-Calculator/R.I.I.C-Calculator.exe"
$zipItem = Get-Item $zipPath

Write-Host "Done!"
Write-Host "Exe path: release/R.I.I.C-Calculator/R.I.I.C-Calculator.exe"
Write-Host "Exe size: $([math]::Round($exeItem.Length / 1KB, 1)) KB"
Write-Host "Zip path: $zipPath"
Write-Host "Zip size: $([math]::Round($zipItem.Length / 1MB, 1)) MB"
