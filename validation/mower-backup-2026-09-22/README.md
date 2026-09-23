# Mower 副表验收材料

`roster.json` 与 `source-roster.jpeg` 为本次九副表回归输入；`screenshot-observations.json` 为截图转录及用户确认的参数。

最终结论见 `parity-diagnosis.md` 和 `screenshot-parity-report.md`。完整图片数值一致性尚未通过，不能把运行成功视为完全复现。

`reference-runs/` 保存报告所需的精简参考结果：保留参数、指标、干员工休、房间统计、已完成订单及最终轮班事件，省略庞大的生产账本与中间事件。两个 Python 脚本优先读取本地完整运行结果，不存在时读取这些参考文件，因此克隆仓库后也可复核报告和双种子轮班一致性：

```powershell
python validation/mower-backup-2026-09-22/diagnose-parity.py
python validation/mower-backup-2026-09-22/compare-screenshots.py
```

重新执行最终场景（每个种子分别运行）：

```powershell
$env:MOWER_PARITY_CONFIRMED='1'
$env:MOWER_PARITY_LONG='1'
$env:MOWER_PARITY_SEED='42'
$env:MOWER_PARITY_OUTPUT='screenshot-independent-clock.json'
pnpm exec vitest run src/scheduler/mowerScreenshotParity.spec.ts --maxWorkers=1
$env:MOWER_PARITY_SEED='2026'
$env:MOWER_PARITY_OUTPUT='screenshot-independent-clock-seed2026.json'
pnpm exec vitest run src/scheduler/mowerScreenshotParity.spec.ts --maxWorkers=1
```

生成的完整账本与实验快照保留在本地并由此目录的 `.gitignore` 排除。历史失败日志用于说明缺陷和修复过程；最终验证清单见诊断报告。
