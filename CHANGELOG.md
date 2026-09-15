# 更新日志 (Changelog) - 2026-09-15

## 概括总结 (Summary)

本次会话完成了从远程分支 `mode/shift-run` 的基线拉取与本地化改造，针对排班编辑、无人机加速逻辑、界面布局、动态模拟参数与产出口径进行了深度重构与定制，并完成对实际运行排班的工休比和 82 算法对比分析。所有修改均保留在本地，未进行远程推送。

主要涵盖四大方面：
1. **工作台与设施布局解锁**：新建排班表解锁设施等级自由修改，支持自由切换 252/333/153 布局并通过电量校验。
2. **无人机与设置体系精简重构**：
   - 将“不加速/加速赤金/加速经验”改造为“加速贸易站”，并支持下拉选择具体加速的贸易站房间。
   - 新增独立的“设置”子页面（导航 Tab），迁移所有模拟运行选项。
   - 锁定整小时暖机跳变、理想跑单、直观产出口径并在界面中隐藏无用选项；彻底移除可选库存和补充闲置干员多余模块。
   - 宿舍默认入驻规范化：自动配置 2 名宿管（1 群体回复 + 1 单体回复），菲亚梅塔优先锁定心情回复最慢宿舍，无心情技能的杜林族联动干员尝试进驻加工站。
3. **82 产出口径与实际净收益校准**：
3. **产出口径校准与 82 算法呈现**：
   - 结果面板首位核心聚焦标准 **【82 综合日产出】**（`EXP + 0.8×赤金产值 + 0.2×龙门币`）。
   - 按用户需求移除了“实际净日收益（日产）”卡片，界面更加清爽专注。
   - 保留贸易收益、作战记录、赤金制造（含净产出与龙舌兰虚拟赤金）及理论无人机明细卡片。
4. **工休比报表对比与副表 (backup_plans) 机制诊断**：
   - 提取并输出了排班 2 (`aade6318`) 的 72 小时动态模拟干员工休比报表。
   - 对比 Mower 实际运行报表，明确指出由于当前计算引擎未执行副表与触发器（仅作为无损信封透传保存），导致深海换班、斩业星熊换班在纯主表模拟下出勤率低于实机。

---

## 详细变更说明（按文件位置）

### 一、工作台视图与组件层 (UI Components)

#### 1. [新增] `src/components/workbench/SettingsView.vue`
- 新增独立的“设置”子页面组件。
- 集中收纳预热时长、分析时长、无人机加速目标与目标贸易站选择、随机种子输入等动态模拟配置。
- 彻底移除了“整小时跳变/平滑增长”、“跑单模式（理想/实际）”、“产出口径选择”等锁定选项，移除了“补充闲置干员”与“可选库存”面板。

#### 2. [修改] `src/components/workbench/WorkbenchShell.vue`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\components\workbench\WorkbenchShell.vue`
- 变更详情:
  - 顶部导航栏新增“排班编辑”、“模拟设置”子页面切换 Tab。
  - 引入并挂载 `SettingsView` 子页面组件。
  - 测算结果面板首位清晰展示 **【82 综合日产出】**，并移除“实际净日收益（日产）”卡片；
  - 联动展示贸易龙门币、制造赤金、制造经验、结余赤金及理论无人机等明细。

#### 3. [修改] `src/components/workbench/FacilityEditor.vue` 与 `FacilityEditor.spec.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\components\workbench\FacilityEditor.vue`
- 变更详情:
  - 解锁设施等级调整限制，允许用户自由升降级制造站、贸易站、发电站等级（例如降级至 Lv.2 或 Lv.1）。
  - 实时联动计算并刷新电量余量，只要最终电量消耗 `<= 发电量` 即可通过电量审核。

#### 4. [修改] `src/components/workbench/PlanToolbar.vue`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\components\workbench\PlanToolbar.vue`
- 变更详情:
  - 调整工具栏按钮逻辑，新建排班表时自动初始化为可自由配置布局的基建设施结构。

---

### 二、排班状态机与桥接层 (Store & Bridge)

#### 5. [修改] `src/workbench/store.ts` 与 `src/workbench/store.spec.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\workbench\store.ts`
- 变更详情:
  - 状态中新增 `settingsTabActive` 页面切换状态。
  - 新增无人机加速贸易站房间 `tradingTargetRoom`（默认 `room_1_1`）和无人机分配模式。
  - 新建排班表默认结构允许修改设施等级，并在电量超标时提供合规提示。

#### 6. [修改] `src/workbench/calculationBridge.ts` 与 `calculationBridge.spec.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\workbench/calculationBridge.ts`
- 变更详情:
  - 修正动态模拟样本时间窗口统计逻辑，订单产出精准过滤 `time >= warmupHours`，避免将预热期订单计入样本期。
  - 重构等效龙门币统计：`totalEquivalentLmd = orderLmd + exp + (netGoldCount + virtualGoldCount) * 500`，反映实际净日增益。
  - 同时输出标准 82 算法总分：`totalScore82 = exp + 0.8 * goldValue + 0.2 * orderLmd`。

---

### 三、模拟器内核与无人机推进 (Simulator Engine)

#### 7. [修改] `src/simulator/productionTimeline.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\simulator\productionTimeline.ts`
- 变更详情:
  - 升级无人机加速逻辑：支持 `droneTarget = 'trading'` 模式。
  - 当无人机存量达到阈值时，自动将富余无人机注入到指定的贸易站（如 `room_1_1`），加速订单获取。

#### 8. [修改] `src/simulator/orderTimeline.ts` 与 `orderTimeline.spec.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\simulator\orderTimeline.ts`
- 变更详情:
  - 适配理想跑单模式锁定，过程中不产生切人或掉单损耗。
  - 支持接受来自无人机时间线的订单加速脉冲。

#### 9. [修改] `src/simulator/resourceLedger.ts` 与 `resourceLedger.spec.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\simulator\resourceLedger.ts`
- 变更详情:
  - 账本统计细化赤金的生产账目与贸易消耗账目，提供独立的结余赤金核算。

#### 10. [修改] `src/simulator/moraleTimeline.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\simulator\moraleTimeline.ts`
- 变更详情:
  - 优化心情演化中的整小时离散跳变步进逻辑，确保与 Mower 离散检查点步长一致。

---

### 四、调度排班与干员规则层 (Scheduler & Operator Rules)

#### 11. [修改] `src/scheduler/rosterRuntime.ts` 与 `rosterRuntime.spec.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\scheduler\rosterRuntime.ts`
- 变更详情:
  - 宿舍自动分配算法升级：每个宿舍固定分配 2 个宿管名额，自动组合 1 个群体回复干员 + 1 个单体回复干员。
  - 加工站联动干员（如杜林族技能联动干员）在无心情回复任务时，尝试入驻加工站。

#### 12. [修改] `src/scheduler/fiammettaPolicy.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\scheduler\fiammettaPolicy.ts`
- 变更详情:
  - 菲亚梅塔专属策略：动态计算 4 间宿舍各自分配干员的心情自然恢复净速率，自动将菲亚梅塔绑定到心情回复最慢的宿舍进行精准充能。

#### 13. [修改] `src/scheduler/compileRosterSchedule.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\scheduler\compileRosterSchedule.ts`
- 变更详情:
  - 编译排班数据时锁定整小时跳变与理想跑单模式参数。
  - 保留并无损导出 Mower 原生配置与副表字段（`backup_plans`）。

#### 14. [修改] `src/domain/types.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\domain\types.ts`
- 变更详情:
  - 扩充 `ProductionOptions`，新增 `tradingTargetRoom?: string`。

---

### 五、设计规范与计划文档 (Documentation)

#### 15. [新增] `docs/基建排班与全动态模拟重构计划书.md`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\docs/基建排班与全动态模拟重构计划书.md`
- 详细规划了工作台交互改造、无人机加速、规则层宿管联动、动态模拟产出校准与回归测试全流程。
