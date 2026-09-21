"""Rebuild the comparison from transcribed observations and simulation evidence."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
def read_run(name):
    path = root / name
    if not path.exists():
        path = root / 'reference-runs' / name
    return json.loads(path.read_text(encoding='utf-8'))
observed = json.loads((root / 'screenshot-observations.json').read_text(encoding='utf-8'))
rows = [r for r in observed['dailyRows'] if r[0] >= observed['sevenDayWindow'][0]]
keys = ['exp', 'goldValue', 'orderLmd', 'tequilaGoldValue']
target = {key: sum(r[i + 1] for r in rows) / len(rows) for i, key in enumerate(keys)}
target['mower82'] = target['exp'] + .8 * (target['goldValue'] + target['tequilaGoldValue']) + .2 * target['orderLmd']
after = read_run('screenshot-scenarios-after.json')
confirmed_file = root / 'screenshot-independent-clock.json'
selected = read_run(confirmed_file.name)[0]
metrics = selected['metrics']
lines = ['# Mower 图片数值对照与优化', '',
 '结论：收益主要分项已接近，尚未通过工休比例与逐类订单分布的一致性验收。不能把总分接近当作全部通过。', '',
 '用户确认图片为长期测试记录。直接读图保留八个日期，近七日均值使用 2025-12-30 至 2026-01-05；数据见 `screenshot-observations.json`。截图 10.89 万可由各分项重新算得 108,928.57 后取两位小数。', '',
 f"模拟条件：原始排班、7 天预热 + {selected['assumptions']['sampleHours']/24:g} 天采样、0.25 小时最大步长、种子 42、理想跑单、潜在产出。用户已确认无人机主要投经验、关闭菲亚防呆、休息阈值65%–70%；下表取65%。原始充能顺序阿罗玛→砾→歌蕾蒂娅保留。没有额外提供闲置干员库，也不加入自动加工行为。固定窗口不是收敛证明。", '',
 '| 日均项目 | 截图 | 优化后（经验无人机） | 相对差异 |', '| --- | ---: | ---: | ---: |']
for key, label in zip(keys + ['mower82'], ['经验', '赤金价值', '订单龙门币', '龙舌兰额外价值', 'Mower 82']):
    lines.append(f'| {label} | {target[key]:,.2f} | {metrics[key]:,.2f} | {(metrics[key]/target[key]-1)*100:+.2f}% |')
lines += ['', '## 对照用户补充的理想工休', '', '| 组合代表 | 理想占比 | 模拟实际在岗（含疲劳） |', '| --- | ---: | ---: |']
for group, name in [('感知','黑键'),('深海','歌蕾蒂娅'),('自动化','森蚺'),('红松','焰尾'),('苍苔棘刺','苍苔')]:
    op = next(o for o in selected['operators'] if o['operatorName'] == name)
    physical = (op['workHours'] + op['exhaustedHours']) / selected['assumptions']['sampleHours'] * 100
    lines.append(f"| {group}（{name}） | {observed['idealDuty'][group]*100:.2f}% | {physical:.2f}% |")
lines += ['', '这些比例仍有残差，且截图心情差分统计不等于物理在岗统计。当前不能宣布工休验收通过。', '', '## 实际修改', '',
 '- 默认单体恢复目标跳过不能接受外部恢复的菲亚梅塔。仍保留显式指定目标；“选择首个可恢复目标”继续标为模拟策略，不冒充已确认的游戏随机分配规则。',
 '- 修复常驻干员被副表任务移入宿舍后，空返岗分组造成第 172.34 小时崩溃的问题。仅普通可轮班工作岗位生成返岗截止时间。',
 '- 修复按主排班顺序而非宿舍顺序选择首个高优先级返岗成员的问题。Mower按首个宿舍成员的恢复时间判断是否等待回满；同种子28天采样综合收益进一步提高到107,603.57。详见 `parity-diagnosis.md`，包含第二个随机种子与订单波动分析。',
 '- 进一步修复理想订单事件切分心情时间步造成的累计时间漂移。最终表格采用独立轮班时钟；宿舍顺序阶段的107,603.57是历史中间值。完整原因、双种子一致性和随机订单解释见 `parity-diagnosis.md`。',
 '- 返岗防空循环门槛改用干员心情下限加2，不再使用下班规划阈值加2。Mower依据高优先级成员的休息截止时间带整组返岗，低优先级成员无需达到下班规划阈值。同条件28天采样综合收益由106,471.43提高到106,978.57；感知组实际在岗率由71.90%提高到74.57%。下限加2仍是模拟稳定性保护，不宣称完整复刻设备任务时序。',
 '- 新增日志中的 Mower 报表口径区：分开列出经验、真实赤金、订单、龙舌兰额外价值、82 分及平均订单金额。主结果面板原本已有虚拟赤金折算；本次对照直接从采样期订单事件计算，未修改自动排班评分合同，也不增加物理库存。', '',
 '## 无人机场景（确认防呆设置前的敏感性试验）', '', '| 投向 | 经验 | 赤金价值 | Mower 82 |', '| --- | ---: | ---: | ---: |']
for r in after:
    m = r['metrics']
    lines.append(f"| {r['droneTarget']} | {m['exp']:,.2f} | {m['goldValue']:,.2f} | {m['mower82']:,.2f} |")
lines += ['', '在仍开启防呆的同条件对照中，修复前经验 22,571.43、赤金 81,571.43、订单 71,214.29、Mower 82 为 102,928.57；修复后82为107,771.43，总偏差从 -5.51% 降至 -1.06%。上面的最终表格另外应用了用户后续确认的关闭防呆设置。', '',
 '## 工休与订单尚未通过', '',
 'Mower `ui/src/pages/RecordPie.vue` 按相邻观测点的心情差分计算：下降或不变视为工作，上升视为休息；菲亚梅塔强制显示全休。充能、缓慢恢复、采样间隔和跨设施切换都会影响比例。因此不能以模拟非疲劳工时或实际在岗时长直接冒充该值。下表刻意保留两种不同口径，差异仅用于定位。', '',
 '| 干员 | 截图心情差分工作占比 | 模拟实际在岗（含疲劳） |', '| --- | ---: | ---: |']
for op in selected['operators']:
    if op['operatorName'] in observed['workPercent']:
        physical = (op['workHours'] + op['exhaustedHours']) / selected['assumptions']['sampleHours'] * 100
        lines.append(f"| {op['operatorName']} | {observed['workPercent'][op['operatorName']]:.2f}% | {physical:.2f}% |")
lines += ['', f"模拟平均订单金额 {metrics['meanOrderValue']:.2f}，截图曲线约 2,100–2,200。原图无逐类数值标签，不能据此宣称订单分布精确一致。龙舌兰额外奖励相对差异为 {(metrics['tequilaGoldValue']/target['tequilaGoldValue']-1)*100:+.2f}%，总收益接近不能掩盖此项偏差。", '',
 '用户补充的理想工休为感知79%、深海62%、自动化81%、红松84%、苍苔棘刺75%。Mower原始心情采样时刻不可得，因此报告保留采样口径不一致及调度残差，不通过人为改动消耗/恢复率配平这些数字。页面设置现可保存防呆和休息阈值，并传入计算工作线程。', '',
 '## 验证证据', '',
 '- 本轮最终完整回归见`diagnosis-full-regression.txt`，搜索采样窗口修订与补充回归见`search-final.txt`、`search-one-day-final.txt`；合并覆盖1082项通过、1项跳过。详见`parity-diagnosis.md`，保留最初失败的原因和证据。',
 '- `parity-complete-regression.txt`：完整回归（图片长窗口单独运行）1072项通过、1项跳过、7项默认5秒超时。超时项复验：`automatic-backup-final.txt`对应1项通过，`shift-contract-final.txt`全19项通过（包含另6项）；合并覆盖1079项通过、1项跳过，无剩余断言失败。原始超时日志保留。',
 '- `return-threshold-final-tests.txt`：13项返岗专项通过，包括低优先级成员在规划阈值以下随组返岗；最终类型检查和构建通过。',
 '- `dorm-order-before.txt`复现首床4小时错误返回2小时；`dorm-order-after.txt`31项通过。宿舍顺序修复的两个种子阶段证据为`dorm-order-long.txt`及`dorm-order-seed2026.txt`。最终表来源为`screenshot-independent-clock.json`；第二种子为`screenshot-independent-clock-seed2026.json`。',
 '- `screenshot-scenarios-after.txt`：三种无人机场景各完成 336 小时运行；另有常驻返岗回归，共 13 项通过。',
 '- `recovery-parity-tests.txt`：恢复规则、模拟、报表测试 51 项通过；补充截图七日公式测试后报表 2 项通过。',
 '- `parity-regression.txt`：相关调度、理想跑单、页面及工作台 67 项通过，类型检查与构建通过。',
 '- `parity-final-tests.txt`：原图解码、24/168 小时九副表、常驻返岗和报表 16 项通过，类型检查通过。',
 '- `screenshot-confirmed-settings.txt`：关闭防呆，65%、67.5%、70%三个休息阈值均完成7天预热+7天采样。',
 '- `screenshot-confirmed-long.txt`：用户确认参数下7天预热+28天采样完成；`return-threshold-long.txt`和`screenshot-return-threshold.json`为返岗门槛修正后的同窗口阶段结果；最终宿舍顺序修复另见上列文件。',
 '- `settings-tests.txt`：设置传入工作线程与计算入口11项测试通过；页面刷新后关闭防呆、65%阈值、经验无人机、种子42仍保留。',
 '- 浏览器原排班重新计算成功，日志对照区可见。页面采用 72 小时预热和默认随机种子，得到 108,042.86 分/日；不混入上表固定种子结果。', '',
 '- 上一轮页面按用户确认设置（关闭防呆、65%、经验无人机、种子42、7天预热+7天采样）复验成功。返岗门槛修正前107,542.9分/日，修正后107,485.7分/日。这是宿舍顺序和独立时钟修复前的历史UI证据；页面采用整小时暖机，固定测试采用连续暖机，且窗口长度不同，不混用数值。', '',
 '实现前/失败证据保留用于追溯。原有验收报告只能证明当时的测试窗口，不应继续视为图片数值已复现。']
(root / 'screenshot-parity-report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(root / 'screenshot-comparison.json').write_text(json.dumps({'observed': target, 'after': metrics, 'completeParity': False}, ensure_ascii=False, indent=2), encoding='utf-8')
