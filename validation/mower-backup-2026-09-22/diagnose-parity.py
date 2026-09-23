"""Source-backed diagnosis; no fitting of rates or probabilities to screenshots."""
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parent
def read(name):
    path = root / name
    if not path.exists():
        path = root / 'reference-runs' / name
    return json.loads(path.read_text(encoding='utf-8'))
observed = read('screenshot-observations.json')
before = read('screenshot-return-threshold.json')[0]
after = read('screenshot-independent-clock.json')[0]
other = read('screenshot-independent-clock-seed2026.json')[0]
def normalized_events(run):
    return [{k: round(v, 6) if k == 'time' else v for k, v in e.items()
             if k not in ['moraleBefore', 'moraleAfter']} for e in run['rosterEvents']]
assert normalized_events(after) == normalized_events(other), 'Long-window roster events depend on production RNG'
assert len(after['operators']) == len(other['operators'])
for a, b in zip(after['operators'], other['operators']):
    assert a['operatorId'] == b['operatorId']
    for key in ['workHours', 'exhaustedHours', 'restHours', 'idleHours', 'finalMorale']:
        assert abs(a[key] - b[key]) < 1e-6, (a['operatorId'], key, a[key], b[key])

def orders(run):
    return [e for e in run['production']['events'] if e['type'] == 'order-completed'
            and e['time'] > run['assumptions']['warmupHours'] and e['roomId'] == 'room_1_1']

def order_stats(run):
    es = orders(run)
    n = len(es)
    k = sum(e['order']['kind'] == 'tequila' for e in es)
    # Conditional count illustration; throughput and the screenshot's true order
    # count are not fixed/known, so this is not a formal parity acceptance test.
    week_n = round(n * 168 / run['assumptions']['sampleHours'])
    probabilities = [math.comb(week_n, i) * .2**i * .8**(week_n-i) for i in range(week_n+1)]
    def quantile(p):
        return next(i for i in range(week_n+1) if sum(probabilities[:i+1]) >= p)
    return {'orders': n, 'tequilaOrders': k, 'tequilaFraction': k/n,
            'illustrativeWeeklyOrders': week_n, 'conditional95CountRange': [quantile(.025), quantile(.975)],
            'conditionalProbabilityAtLeast26': sum(probabilities[26:])}

results = {'before': before['metrics'], 'after': after['metrics'], 'otherSeed': other['metrics'],
           'seed42Orders': order_stats(after), 'seed2026Orders': order_stats(other),
           'rosterSeedInvariant': True, 'comparedRosterEvents': len(after['rosterEvents']), 'completeParity': False}
(root / 'parity-diagnosis.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
lines = ['# 剩余差异诊断与解决方案', '',
 '## 已确认并修复：返岗成员顺序错误', '',
 'Mower `arknights_mower/utils/scheduler_task.py` 的 `plan_metadata` 先按宿舍顺序分组，再保留顺序筛选高优先级成员；第一个成员与其他成员的恢复时间差决定是否等待它回满。模拟器错误地改用主排班位置顺序。', '',
 '独立回归：第一床还需4小时、第二床还需2小时，二电站差值超过1.5小时，应等待4小时；修改前得到2小时，修改后得到4小时。同时保留全组缺床检查和恢复保护。证据：`dorm-order-before.txt`、`dorm-order-after.txt`。', '',
 '## 已确认并修复：订单随机切步污染长期轮班', '',
 '理想跑单只改变生产订单，不应改变工休。原实现让每张随机订单的完成时间切分心情积分，336小时双种子逐事件回归失败：第324小时同一返岗事件漂移约0.4秒，长窗口进一步放大。仅改为速率区间起点积分仍未通过，因此已撤回该试验。', '',
 '最终实现保留独立的心情事件边界及其精确端点，订单只在其内部细分生产计算；不舍入12/18/20等内部心情阈值，不改技能速率。实际换人跑单模式不走这条独立时钟。336小时双种子回归转为通过；本脚本还强制验证最终7天预热+28天采样的换班事件序列（时间取6位小数）及每人累计工休（误差小于1e-6小时）一致。', '',
 '证据：`roster-seed-336-before.txt`、`roster-seed-336-anchored.txt`（未采用试验）、`roster-seed-336-clock.txt`、`independent-clock-long.txt`、`independent-clock-seed2026.txt`。', '',
 '## 龙舌兰：不能把单次随机结果的相对差异视为确定性计算错误', '',
 'Mower report.vue 按龙舌兰订单数×500计额外赤金价值，模拟采用相同奖励。三级普通品质的4金订单概率为20%；截图七天额外价值合计13000，对应26单。', '',
 '| 场景（7天预热+28天采样） | 综合收益/日 | 龙舌兰额外/日 | 三级站订单数 | 龙舌兰单数 | 比例 |',
 '| --- | ---: | ---: | ---: | ---: | ---: |']
for label, run in [('修复前，种子42', before), ('修复后，种子42', after), ('修复后，种子2026', other)]:
    st = order_stats(run)
    lines.append(f"| {label} | {run['metrics']['mower82']:.2f} | {run['metrics']['tequilaGoldValue']:.2f} | {st['orders']} | {st['tequilaOrders']} | {st['tequilaFraction']:.2%} |")
st = order_stats(after)
lines += ['', f"以修复后吞吐估计每周{st['illustrativeWeeklyOrders']}张三级单、20%概率为条件，95%计数区间约{st['conditional95CountRange'][0]}–{st['conditional95CountRange'][1]}单，出现至少26单的概率约{st['conditionalProbabilityAtLeast26']:.1%}。这是解释波动的条件模型；缺少截图实际三级订单总数，不能用它正式宣布统计验收通过。两个随机种子也不足以证明收敛。", '',
 '解决方式：保留来源支持的20%概率和500奖励，比较等长周窗口、多个种子及订单计数分布；禁止直接乘以截图/模拟比值补偿。', '',
 '## 工休：统计口径差异与调度差异需要分开', '',
 'Mower RecordPie.vue 将相邻心情读数下降或持平的整段时间算作工作，上升算作休息，并把单独的菲亚梅塔显示为全休。组饼图通常取非零最小值，包含歌蕾蒂娅/乌尔比安/斯卡蒂/幽灵鲨的深海组则取最大值。模拟器的在岗、疲劳、休息、闲置是物理状态，不能替代上述观测量。尤其闲置心情不变也可能被Mower算作工作。', '',
 '| 干员 | 截图心情差分工作% | 模拟有效工作% | 模拟含疲劳在岗% | 模拟闲置% |', '| --- | ---: | ---: | ---: | ---: |']
for name in ['黑键','歌蕾蒂娅','森蚺','焰尾','苍苔','夕','斩业星熊']:
    op = next(o for o in after['operators'] if o['operatorName'] == name)
    factor = 100 / after['assumptions']['sampleHours']
    lines.append(f"| {name} | {observed['workPercent'][name]:.2f} | {op['workHours']*factor:.2f} | {(op['workHours']+op['exhaustedHours'])*factor:.2f} | {op['idleHours']*factor:.2f} |")
lines += ['', '解决方式：对齐统计定义后再比较；不能把“闲置”简单加到“工作”来冒充原图，因为真实采样可能跨越多个状态或充能事件。没有原始采样时刻，原饼图无法唯一反推。在岗比例仍用于定位调度偏差，而不是强行拟合截图百分比。', '',
 '## 仍存在的模型边界', '',
 '本项目按既定合同采用理想跑单和零设备操作耗时；Mower实际有任务排队、识别与换人耗时。单体恢复目标采用首个可恢复成员的确定性策略，未证明与游戏实际选靶完全等价。截图不能唯一确定这些参数，不应通过调整基础消耗率来掩盖。休息阈值用户给定65%–70%，本次固定65%；这一范围也不是唯一配置。', '',
 '下一层验收应以Mower源码的事件顺序和宿舍分配为约束，逐事件比较同初始状态的轨迹；收益用等长多窗口分布验收，工休使用相同心情采样规则。当前已修复宿舍顺序和生产事件影响轮班时钟的问题，但完整图片复现仍未通过。', '',
 '## 最终验证', '',
 '- `diagnosis-full-regression.txt`：1080项通过、1项跳过、1项旧24小时小收益断言失败。原因已留存于`search-failure.json`：下界为零，不能确认改进。',
 '- `search-final.txt`：将该集成用例采样扩展到72小时后，8项搜索测试全部通过，独立168小时复验断言未放宽；`search-one-day-final.txt`另新增1项，确认原24小时情况必须拒绝升级。合并覆盖1082项通过、1项跳过。',
 '- `roster-seed-336-clock.txt`：336小时双种子事件一致性与模拟/理想跑单19项通过。两个最终840小时运行和1669个采样期事件一致性由本脚本强制断言。',
 '- 类型检查、构建通过（`diagnosis-build.txt`）；仍有原有大包体积提示。原图解码及24/168小时九副表长测包含在完整回归中。自动排班仍只输出主表。']
(root / 'parity-diagnosis.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
