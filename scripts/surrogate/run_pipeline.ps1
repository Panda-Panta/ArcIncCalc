# ==============================================================================
# 罗德岛基建排班代理模型 (Surrogate Model) 本地一键执行流水线
# 支持纯本地离线运行，不受网络波动或 AI 会话中断影响
# ==============================================================================

param (
    [switch]$All,
    [switch]$Generate,
    [switch]$Train,
    [switch]$Export,
    [switch]$Test,
    [int]$Samples = 120000,
    [int]$Epochs = 20,
    [int]$BatchSize = 512,
    [double]$Lr = 0.001
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 确保在项目根目录运行
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $ProjectRoot

function Print-Header {
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host " 🚀 罗德岛基建排班深度学习代理模型 (Surrogate Model) 本地工作流" -ForegroundColor Green
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host " 工作目录: $ProjectRoot" -ForegroundColor DarkGray
    Write-Host ""
}

function Check-Environment {
    Write-Host "[1/4] 检查本地环境依赖..." -ForegroundColor Yellow
    
    # 检查 Node
    try {
        $nodeVer = node -v
        Write-Host "  ✅ Node.js: $nodeVer" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ 缺少 Node.js，请安装 Node.js 18+ 后再运行。" -ForegroundColor Red
        exit 1
    }

    # 检查 Python
    try {
        $pyVer = python --version
        Write-Host "  ✅ Python: $pyVer" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ 缺少 Python，请安装 Python 3.10+ 并加入 PATH。" -ForegroundColor Red
        exit 1
    }

    # 检查 PyTorch 与 ONNX Runtime
    $pyCheck = python -c "import torch, onnx, onnxruntime; print(f'Torch: {torch.__version__}, CUDA: {torch.cuda.is_available()}')" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Python 科学计算栈: $pyCheck" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ Python 缺少部分依赖 (torch / onnx / onnxruntime)，可通过 pip install torch onnx onnxruntime scipy 安装。" -ForegroundColor Magenta
    }
    Write-Host ""
}

function Run-GenerateDataset {
    param ([int]$Count)
    Write-Host "-----------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " 📦 步骤 1: 生成离线仿真训练数据 (样本量: $($Count.ToString('N0')))" -ForegroundColor Yellow
    Write-Host "-----------------------------------------------------------------" -ForegroundColor Cyan
    $t0 = Get-Date
    npx tsx scripts/surrogate/generate_dataset.ts $Count
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 数据生成失败!" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    $elapsed = ((Get-Date) - $t0).TotalSeconds
    Write-Host "✅ 数据集生成完成，耗时: $($elapsed.ToString('F2')) 秒" -ForegroundColor Green
    Write-Host ""
}

function Run-TrainModel {
    param ([int]$Ep, [int]$Bs, [double]$LearningRate)
    Write-Host "-----------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " 🧠 步骤 2: 训练 Res-MLP 代理模型 (轮数: $Ep, 批大小: $Bs, lr: $LearningRate)" -ForegroundColor Yellow
    Write-Host "-----------------------------------------------------------------" -ForegroundColor Cyan
    $t0 = Get-Date
    python scripts/surrogate/train.py --epochs $Ep --batch-size $Bs --lr $LearningRate
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 模型训练失败!" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    $elapsed = ((Get-Date) - $t0).TotalSeconds
    Write-Host "✅ 模型训练完成，耗时: $($elapsed.ToString('F2')) 秒" -ForegroundColor Green
    Write-Host ""
}

function Run-ExportModel {
    Write-Host "-----------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " 📤 步骤 3: 导出 FP32 ONNX 并量化为 INT8 (浏览器极速版)" -ForegroundColor Yellow
    Write-Host "-----------------------------------------------------------------" -ForegroundColor Cyan
    $t0 = Get-Date
    python scripts/surrogate/export.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ ONNX 导出量化失败!" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    $elapsed = ((Get-Date) - $t0).TotalSeconds
    Write-Host "✅ ONNX 导出量化完成，耗时: $($elapsed.ToString('F2')) 秒" -ForegroundColor Green
    Write-Host ""
}

function Run-Tests {
    Write-Host "-----------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " 🧪 步骤 4: 运行回归测试套件 (验证代理模型与排班管线正确性)" -ForegroundColor Yellow
    Write-Host "-----------------------------------------------------------------" -ForegroundColor Cyan
    npx vitest run src/surrogate/ src/optimizer/surrogateOptimizerBridge.spec.ts
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 回归测试未通过!" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "✅ 核心测试套件全部通过!" -ForegroundColor Green
    Write-Host ""
}

Print-Header

# 命令行直通模式
if ($All) {
    Check-Environment
    Run-GenerateDataset -Count $Samples
    Run-TrainModel -Ep $Epochs -Bs $BatchSize -LearningRate $Lr
    Run-ExportModel
    Run-Tests
    Write-Host "🎉 全套工作流执行成功！" -ForegroundColor Green
    exit 0
}

if ($Generate) {
    Check-Environment
    Run-GenerateDataset -Count $Samples
    exit 0
}

if ($Train) {
    Check-Environment
    Run-TrainModel -Ep $Epochs -Bs $BatchSize -LearningRate $Lr
    exit 0
}

if ($Export) {
    Check-Environment
    Run-ExportModel
    exit 0
}

if ($Test) {
    Check-Environment
    Run-Tests
    exit 0
}

# 交互式菜单模式
Check-Environment

while ($true) {
    Write-Host "请选择要执行的本地操作:" -ForegroundColor White
    Write-Host "  [1] 一键执行全流程 (生成数据 -> 训练模型 -> 导出量化 -> 回归测试)" -ForegroundColor Cyan
    Write-Host "  [2] 仅生成训练数据 (默认 120,000 组二进制样本)" -ForegroundColor Gray
    Write-Host "  [3] 仅训练 PyTorch 模型 (20 轮残差感知机)" -ForegroundColor Gray
    Write-Host "  [4] 仅导出并量化 ONNX 模型 (生成 FP32 与 INT8 模型)" -ForegroundColor Gray
    Write-Host "  [5] 运行排班与模型回归测试 (Vitest)" -ForegroundColor Gray
    Write-Host "  [6] 运行类型检查 (vue-tsc)" -ForegroundColor Gray
    Write-Host "  [7] 启动本地开发网页服务 (pnpm dev)" -ForegroundColor Gray
    Write-Host "  [0] 退出" -ForegroundColor DarkGray
    Write-Host ""

    $choice = Read-Host "输入选项数字 (0-7)"

    switch ($choice) {
        "1" {
            Run-GenerateDataset -Count $Samples
            Run-TrainModel -Ep $Epochs -Bs $BatchSize -LearningRate $Lr
            Run-ExportModel
            Run-Tests
            Write-Host "🎉 全流程执行完毕！可在浏览器启动测试。" -ForegroundColor Green
            Write-Host ""
        }
        "2" {
            $inputSamples = Read-Host "输入生成样本数 [直接回车默认 $Samples]"
            $cnt = if ([string]::IsNullOrWhiteSpace($inputSamples)) { $Samples } else { [int]$inputSamples }
            Run-GenerateDataset -Count $cnt
        }
        "3" {
            $inputEp = Read-Host "输入训练轮数 [直接回车默认 $Epochs]"
            $ep = if ([string]::IsNullOrWhiteSpace($inputEp)) { $Epochs } else { [int]$inputEp }
            Run-TrainModel -Ep $ep -Bs $BatchSize -LearningRate $Lr
        }
        "4" {
            Run-ExportModel
        }
        "5" {
            Run-Tests
        }
        "6" {
            Write-Host "正在执行 vue-tsc 类型检查..." -ForegroundColor Yellow
            npx vue-tsc -b
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ 0 类型错误，全部通过！" -ForegroundColor Green
            }
        }
        "7" {
            Write-Host "启动本地前端开发服务 (按 Ctrl+C 可停止)..." -ForegroundColor Yellow
            pnpm dev
        }
        "0" {
            Write-Host "已退出。" -ForegroundColor Yellow
            exit 0
        }
        default {
            Write-Host "无效选项，请重新选择。" -ForegroundColor Magenta
        }
    }
}
