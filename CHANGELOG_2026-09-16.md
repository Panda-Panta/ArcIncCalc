# 更新日志 (Changelog) - 2026-09-16

## 概括总结 (Summary)

本次会话完成了**一键排班算法的全面重构与系统级实施**。针对原代码库中自动排班算法只依赖纯静态 82 快照、不支持起始点、无法处理实际工休衰减与换班时序的根本性短板，全新设计并落地了**三层优化架构**（静态贪心骨架构建 → 动态仿真验证 → 邻域深度微调）。同时实现了前端工具栏下方的整行进度指示条，实现了排班完成后自动导入编辑器及产出重新计算，并完成源码双重备份与桌面客户端同步。

核心更新概括为五大方面：
1. **源码双重安全备份**：建立了独立 Git 分支 `backup/pre-smart-roster-20260916` 以及物理全量归档压缩包 `src_backup_20260916.zip`。
2. **全新三层优化排班算法 (`smartRoster.ts`)**：
   - 阶段 1（静态贪心）：基于全表 82 分净增量，统合跨房间模板、组合库及单人散件贪心排布，中枢 5 工位协同竞争，二分图匹配分配最优候补。
   - 阶段 2（动态仿真）：对 Top-K 骨架运行 1 天预热 + 3 天采样真实仿真，根据实际完成量计算 82 得分，彻底淘汰“纸面高分但快速疲劳”的不良组合，并准确记录特殊心情干员真实工休比。
   - 阶段 3（邻域搜索）：在仿真最优解上执行 Hill-Climb 局部搜索，并自动应用智能宿管分配规则。
3. **支持起始点计算**：彻底移除“必须全空工作台”的准入阻断，自动锁定用户在排班表中手动放置的已有干员，只在剩余空位中组队填充。
4. **前端交互与自动导入闭环**：
   - 工具栏在“自动生成排班”按钮下方增加了一整行进度指示器与动态进度条，实时呈现各阶段执行状态。
   - 生成成功后自动同步至 Store 与排班编辑器，无需手动导入；同时自动触发收益计算刷新 82 得分。
5. **完整测试覆盖与桌面端部署**：
   - 新增算法测试套件与工作台集成测试（涵盖 243 空白生成、预置干员锁定生成、252 双贸易布局生成）。
   - 客户端完成构建并同步至 `D:\Tools\ArcIncCalc\dist`。

---

## 详细变更说明（按文件位置）

### 一、排班与优化核心算法层 (Optimizer Core)

#### 1. [新增] `src/optimizer/smartRoster.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\optimizer\smartRoster.ts`
- 变更详情:
  - 核心导出函数 `runSmartRoster(base, entries, options, onProgress)`。
  - **起始点与锁定机制**：遍历当前工作台所有房间与槽位，将已有在岗干员（`occupant.kind === 'operator'`）及其槽位标记为锁定，保留用户的个性化排班配置。
  - **阶段 1 静态构建**：
    - 加载可用跨房间模板 (`CROSS_ROOM_TEMPLATES`) 与已录入干员组合库 (`admitCombinationCandidates`)。
    - 以全表 82 综合产出得分（`score = exp + 0.8×GoldValue + 0.2×OrderValue`）作为边际增量评估标准。
    - 结合多轮次 (Trials) 随机打乱搜索，生成多种差异化候选骨架并进行指纹去重。
    - 单人散件贪心填充与中枢 (Control Room) 协同组队，并调用二分图匹配 (`assignBackups`) 自动配置最优候补。
  - **阶段 2 动态仿真验证**：
    - 对静态排名前列的 Top-K 方案调用 `runScheduleSimulationBridge` 运行 24 小时预热 + 72 小时真实时序离散事件模拟。
    - 采集采样窗口内实际完成的作战记录、赤金和订单龙门币，折算每日综合 82 分。
    - 提取并记录特殊心情消耗干员（如歌蕾蒂娅、阿米娅、菲亚梅塔等）的真实 `workFraction`、`workRestRatio` 及工休时间明细。
  - **阶段 3 邻域深度微调**：
    - 以仿真最佳方案作为起点，调用 `runRosterIncomeSearch` 执行 Hill-Climb 爬山搜索，探索中枢与生产主班微调提升空间。
    - 最终调用 `applySmartDormitoryPolicy` 完成宿管与联动干员自动化配置。

#### 2. [新增] `src/optimizer/smartRosterWorker.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\optimizer\smartRosterWorker.ts`
- 变更详情:
  - Web Worker 专用入口，将多阶段计算从浏览器/应用主线程剥离，避免 UI 卡顿。
  - 接收 `{ base, entries, options }`，通过 `postMessage({ type: 'progress', progress })` 向主线程实时派发当前阶段及百分比进度。

#### 3. [新增] `src/optimizer/smartRoster.spec.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\optimizer\smartRoster.spec.ts`
- 变更详情:
  - 包含 3 个专项测试用例：
    1. `builds complete 243 mains with backups and simulation validation`：验证 243 标准布局空白起点下的主班全填充、候补唯一性及仿真产出得分计算。
    2. `preserves user-locked operators when starting from a partial layout`：验证预先在贸易站放置德克萨斯和拉普兰德时，算法完整保留该配置并在其余房间继续组队。
    3. `adapts to 252 layout with two-seat trading room`：验证 252 极限产出布局（5 制造 2 贸易 2 发电）自适应。

---

### 二、工作台前端视图与交互层 (UI & Workbench)

#### 4. [修改] `src/components/workbench/PlanToolbar.vue`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\components\workbench\PlanToolbar.vue`
- 变更详情:
  - 在 `PlanToolbarProps` 中新增 `generationProgress?: SmartRosterProgress | null` 响应式属性。
  - **交互位置实现**：在“自动生成排班”按钮的正下方放置了一整行的进度提示区域（`.generation-progress-row`）。
  - 内置旋转指示器、当前执行阶段文本描述（如 `阶段 1/3: 静态贪心构建...`）以及基于百分比计算的平滑进度条轨道（`.progress-bar-fill`）。
  - 新增对应的暗黑风格高对比度 CSS 样式，契合 Mower 终端主题。

#### 5. [修改] `src/components/workbench/WorkbenchShell.vue`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\components\workbench\WorkbenchShell.vue`
- 变更详情:
  - 移除了原有的纯静态清空逻辑（不再将所有槽位重置为 `empty`），直接以当前 `store.workspace` 作为输入。
  - 新增 `generationProgress` 状态并在 `defineExpose` 中对外暴露。
  - 重写 `handleAutoGenerate()` 方法：
    - 集成 `SmartRosterWorker` 并在不支持 Worker 的环境或测试环境中安全回退至同步执行。
    - 排班成功后自动调用 `store.loadWorkspace(report.workspace)`，直接替换并更新排班表编辑器与基建全景图。
    - 成功横幅提示中显示算法最终达成的 82 综合日产出预估得分。
    - 自动触发 `handleCalculate()` 执行产出计算与面板数据刷新。
  - 在 `<PlanToolbar>` 标签上传递 `:generation-progress="generationProgress"`。

#### 6. [修改] `src/components/workbench/WorkbenchShell.spec.ts`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\src\components\workbench\WorkbenchShell.spec.ts`
- 变更详情:
  - 新增第 15 项集成测试用例：`triggers smart roster generation, keeps user placed operators, and updates store`。
  - 模拟真实干员库录入，验证预置干员保留、状态更新与结果反馈。

---

### 三、配置与工程基础设施 (Config & Infrastructure)

#### 7. [修改] `.gitignore`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\.gitignore`
- 变更详情:
  - 添加 `src_backup_*.zip` 忽略规则，防止本地备份物理压缩包被误提交到 Git。

#### 8. [更新] `一键排班算法实施计划.md`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\一键排班算法实施计划.md`
- 变更详情:
  - 归档了原计划中的短板诊断与架构问题，整理了确认后的三层优化方案、数学模型与验证标准。

#### 9. [归档/备份]
- **Git 备份分支**: `backup/pre-smart-roster-20260916`
- **源码压缩包**: `d:\Project\Arknights\ArcIncCalc\src_backup_20260916.zip`
- **桌面构建部署路径**: `D:\Tools\ArcIncCalc\dist`

---

### 四、桌面端图标透明化与发布同步 (App Icon & Packaging)

#### 10. [修复] `desktop/app.ico`
- 文件位置: `d:\Project\Arknights\ArcIncCalc\desktop\app.ico`
- 变更详情:
  - 诊断根因：原图标各分辨率图层保存为 24 位 RGB（无 Alpha 透明通道），且外部底色填充为纯黑 `RGB(0,0,0)`。
  - 图像处理：通过边界种子泛洪算法（Flood Fill BFS）精准分离外部黑底，保护德克萨斯角色的深色头发与衣着，并对边缘进行亚像素抗锯齿羽化处理。
  - 生成 16×16、32×32、48×48、64×64、128×128、256×256 六层全规格 32 位 RGBA 透明图标。

#### 11. [新增/修改] `public/favicon.ico` & `index.html`
- 变更详情:
  - 将生成的透明图标同步至网页静态资源目录 `public/favicon.ico`。
  - 在 `index.html` 头部加入 `<link rel="icon" href="/favicon.ico" />`，保证网页端标签页同显透明角标。

#### 12. [重新发布] 桌面端客户端
- 输出路径:
  - `d:\Project\Arknights\ArcIncCalc\release\ArcIncCalc\ArcIncCalc.exe`
  - 同步部署至生产运行目录: `D:\Tools\ArcIncCalc\ArcIncCalc.exe` 及 `D:\Tools\ArcIncCalc\dist`

---

### 五、Mower 最新资源同步与独立后勤技能浏览器美化 (Assets Sync & Skills Browser Overhaul)

#### 13. [资产同步] 补齐干员头像与基建技能图标
- **干员头像**：从 Mower 资源包同步补充 19 位此前缺失的干员 WebP 头像至 `public/avatar/`（涵盖结城理、埃癸斯、岳羽由加莉、虎狼丸 P3R 联动组，以及可露希尔、凯尔希·思衡托、予愿安洁莉娜等），彻底消除选人界面的纯文本 fallback 占位。
- **技能图标**：从 Mower 资源包引入全部 552 个官方基建技能 WebP 图标至 `public/building_skill/`。
- **发布更新**：重新执行 `npm run build`，产物全量同步至 `D:\Tools\ArcIncCalc\dist`。

#### 14. [美化与功能重构] `riic_skills_browser.html`
- 文件位置: `C:\Users\Panda-Panta\Downloads\riic_skills_browser.html`（原版已备份为 `.bak`）
- 变更详情:
  - **数据层映射**：通过干员数据库为全部 921 项技能注入了对应的官方 `skillIcon` 字段。
  - **干员头像集成**：干员卡片头部新增 58×58px 专属头像框，根据星级赋予金/紫/蓝等专属呼吸辉光，并配置优雅文字回退。
  - **技能图标集成**：每个后勤技能项标题左侧新增 34×34px 官方基建技能图标框。
  - **微型头像联动**：在技能描述中的协同干员（如 `@温米`）以及阵营弹窗（如 `🏛️ 米诺斯`、`🏛️ S.E.E.S.`）成员标签内均嵌入微型头像芯片。
  - **多维高级筛选**：在原有的设施筛选和联动干员切换基础上，新增星级筛选（6★/5★/4★/3★/1~2★）和八大职业筛选（先锋/近卫/狙击/重装/医疗/辅助/术师/特种），并增加 10 个常用热搜词条（赤金、作战记录、订单、心情、感知信息等）一键填入。
  - **视觉体验升级**：强化 PRTS 终端暗黑科技美学，卡片增加平滑悬浮位移与高亮边框，底部右下角新增平滑“回到顶部”浮标。


