<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import OperatorPicker from './components/OperatorPicker.vue'
import { createDefaultConfig, createRoom, ROOM_LABELS, ROOM_LIMITS } from './domain/defaults'
import { EDITION } from './domain/edition'
import { GAME_DATA_VERSION, OPERATOR_MAP, OPERATOR_PROFILE_COUNT } from './domain/operators'
import type { AppConfig, OperatorGroup, OutputRoom, RoomType, SpecialOrder } from './domain/types'
import { calculate } from './engine/calculate'

const STORAGE_KEY = `arc-income-calculator-config-v5-${EDITION.storageNamespace}`
const LEGACY_STORAGE_KEYS = [
  'arc-income-calculator-config-v5',
  'arc-income-calculator-config-v4',
]

function loadConfig(): AppConfig {
  try {
    const legacyStored = EDITION.importLegacyConfig
      ? LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean)
      : null
    const stored = localStorage.getItem(STORAGE_KEY) ?? legacyStored
    if (stored) {
      const parsed = JSON.parse(stored) as {
        schemaVersion?: number
        rooms?: OutputRoom[]
      }
      if ((parsed.schemaVersion === 4 || parsed.schemaVersion === 5) && parsed.rooms?.length === 9) {
        const migrated = parsed as unknown as AppConfig
        migrated.schemaVersion = 5
        migrated.dormitoryOccupantCount ??= 0
        migrated.operatorGroups ??= []
        if (!EDITION.allowShiftRun) {
          for (const room of migrated.rooms) {
            if (room.specialOrder === 'shiftRun') room.specialOrder = 'none'
          }
        }
        return migrated
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
  return createDefaultConfig()
}

const config = reactive<AppConfig>(loadConfig())
const notice = ref('')
const picker = reactive({
  open: false,
  targetKey: '',
  targetLabel: '',
  roomType: 'manufacture' as RoomType | 'control',
  capacity: 3,
  selectedIds: [] as string[],
})
const report = computed(() => calculate(config))
const counts = computed(() => ({
  manufacture: config.rooms.filter((room) => room.type === 'manufacture').length,
  trading: config.rooms.filter((room) => room.type === 'trading').length,
  power: config.rooms.filter((room) => room.type === 'power').length,
}))
const powerPercent = computed(() => {
  if (report.value.power.consumption === 0) return 100
  return Math.min(100, (report.value.power.generation / report.value.power.consumption) * 100)
})
const assignedTo = computed(() => {
  const assignments: Record<string, string> = {}
  for (const id of config.controlOperatorIds) assignments[id] = '控制中枢'
  for (const room of config.rooms) {
    for (const id of room.operatorIds) assignments[id] = room.id
  }
  return assignments
})
const assignedOperators = computed(() => Object.entries(assignedTo.value).map(([id, location]) => ({
  id,
  name: operatorName(id),
  location,
})))
const groupMembership = computed(() => {
  const membership: Record<string, string> = {}
  for (const group of config.operatorGroups) {
    for (const id of group.operatorIds) membership[id] ??= group.id
  }
  return membership
})

watch(
  config,
  (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)),
  { deep: true },
)

function handleTypeChange(room: OutputRoom, event: Event) {
  const target = (event.target as HTMLSelectElement).value as RoomType
  if (target === room.type) return
  if (counts.value[target] >= ROOM_LIMITS[target]) {
    notice.value = `${ROOM_LABELS[target]}最多可建造 ${ROOM_LIMITS[target]} 个。`
    ;(event.target as HTMLSelectElement).value = room.type
    return
  }
  const replacement = createRoom(room.id, target)
  replacement.level = room.level
  Object.assign(room, replacement)
  pruneZeroMorale()
  notice.value = `${room.id} 已改为${ROOM_LABELS[target]}。`
}

function capacity(room: OutputRoom) {
  return room.type === 'power' ? 1 : room.level
}

function operatorName(id: string) {
  return OPERATOR_MAP.get(id)?.name ?? id
}

function moraleOf(id: string) {
  return config.operatorMorale[id] ?? 24
}

function setMorale(id: string, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  config.operatorMorale[id] = Math.max(0, Math.min(24, Number.isFinite(value) ? value : 24))
  config.zeroMoraleOperatorIds = Object.entries(config.operatorMorale)
    .filter(([, morale]) => morale <= 0)
    .map(([operatorId]) => operatorId)
}

function pruneZeroMorale() {
  const assigned = new Set([...config.controlOperatorIds, ...config.rooms.flatMap((item) => item.operatorIds)])
  config.zeroMoraleOperatorIds = config.zeroMoraleOperatorIds.filter((id) => assigned.has(id))
  for (const group of config.operatorGroups) {
    group.operatorIds = group.operatorIds.filter((id) => assigned.has(id))
  }
}

function addOperatorGroup() {
  const sequence = config.operatorGroups.length + 1
  config.operatorGroups.push({
    id: `group-${Date.now()}-${sequence}`,
    name: `组合 ${sequence}`,
    operatorIds: [],
  })
  notice.value = `已创建组合 ${sequence}，请选择至少两名已进驻干员。`
}

function removeOperatorGroup(group: OperatorGroup) {
  config.operatorGroups = config.operatorGroups.filter((item) => item.id !== group.id)
  notice.value = `已删除组合「${group.name || '未命名组合'}」。`
}

function toggleGroupMember(group: OperatorGroup, operatorId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    if (groupMembership.value[operatorId] && groupMembership.value[operatorId] !== group.id) return
    if (!group.operatorIds.includes(operatorId)) group.operatorIds.push(operatorId)
  } else {
    group.operatorIds = group.operatorIds.filter((id) => id !== operatorId)
  }
}

function openRoomPicker(room: OutputRoom) {
  Object.assign(picker, {
    open: true,
    targetKey: room.id,
    targetLabel: `${room.id} · ${ROOM_LABELS[room.type]}`,
    roomType: room.type,
    capacity: capacity(room),
    selectedIds: [...room.operatorIds],
  })
}

function openControlPicker() {
  Object.assign(picker, {
    open: true,
    targetKey: 'control',
    targetLabel: '控制中枢',
    roomType: 'control',
    capacity: 5,
    selectedIds: [...config.controlOperatorIds],
  })
}

function applyOperators(ids: string[]) {
  if (picker.targetKey === 'control') {
    config.controlOperatorIds = ids
    for (const id of ids) config.operatorMorale[id] ??= 24
    pruneZeroMorale()
    notice.value = `控制中枢已进驻 ${ids.length} 名干员。`
    return
  }
  const room = config.rooms.find((item) => item.id === picker.targetKey)
  if (!room) return
  room.operatorIds = ids
  for (const id of ids) config.operatorMorale[id] ??= 24
  pruneZeroMorale()
  room.operatorCount = ids.length
  room.powerStaffed = ids.length > 0
  notice.value = `${room.id} 已进驻 ${ids.map(operatorName).join('、') || '无人'}。`
}

function resetPlan() {
  Object.assign(config, createDefaultConfig())
  notice.value = '方案已恢复为默认 243 布局。'
}

function onLevelChange(room: OutputRoom) {
  const limit = capacity(room)
  if (room.operatorIds.length > limit) room.operatorIds = room.operatorIds.slice(0, limit)
  room.operatorCount = room.operatorIds.length
  pruneZeroMorale()
}

function format(value: number, digits = 1) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

const productLabels = {
  gold: '赤金',
  exp: '中级作战记录',
  fragment: '源石碎片',
}

const qualityLabels = {
  normal: '常规分布',
  alpha: 'α 峰值',
  beta: 'β 峰值',
}

const specialLabels: Partial<Record<SpecialOrder, string>> = {
  none: '普通订单',
  pepe: '佩佩特别独占',
  closure: '可露希尔特别订单',
  uofficial: 'U-Official',
  provisoAlpha: '但书·α',
  provisoBeta: '但书·β',
  tequilaAlpha: '龙舌兰·α',
  tequilaBeta: '龙舌兰·β',
}
if (EDITION.allowShiftRun) specialLabels.shiftRun = '跑单（自动换入但书/龙舌兰）'
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">R</div>
        <div>
          <p class="eyebrow">RHODES ISLAND · INFRASTRUCTURE</p>
          <h1>基建收益预测终端 <small>{{ EDITION.label }}</small></h1>
          <p class="edition-description">{{ EDITION.description }}</p>
        </div>
      </div>
      <div class="top-actions">
        <label class="plan-name">
          <span>方案名称</span>
          <input v-model="config.planName" maxlength="32" />
        </label>
        <button class="ghost-button" type="button" @click="resetPlan">恢复默认</button>
      </div>
    </header>

    <main>
      <section class="command-strip">
        <div class="room-counts">
          <div><span class="dot manufacture"></span>制造 {{ counts.manufacture }}/5</div>
          <div><span class="dot trading"></span>贸易 {{ counts.trading }}/5</div>
          <div><span class="dot power"></span>发电 {{ counts.power }}/3</div>
          <div class="total-count">总计 {{ config.rooms.length }}/9</div>
        </div>
        <div class="horizon-control">
          <span>预测时长</span>
          <input v-model.number="config.hours" type="range" min="1" max="72" step="1" />
          <strong>{{ config.hours }} 小时</strong>
        </div>
      </section>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>

      <div class="workspace">
        <div class="editor-column">
          <section class="panel room-panel">
            <div class="section-heading">
              <div>
                <p class="section-kicker">OUTPUT GRID</p>
                <h2>产出设施</h2>
              </div>
              <p>选择干员后自动计算房间技能、技能类别与控制中枢联动；手动修正用于尚未量化的技能。</p>
            </div>

            <div class="room-grid">
              <article
                v-for="room in config.rooms"
                :key="room.id"
                class="room-card"
                :class="room.type"
              >
                <div class="room-card-head">
                  <div class="room-code">{{ room.id }}</div>
                  <select :value="room.type" aria-label="设施类型" @change="handleTypeChange(room, $event)">
                    <option
                      v-for="(label, type) in ROOM_LABELS"
                      :key="type"
                      :value="type"
                      :disabled="room.type !== type && counts[type] >= ROOM_LIMITS[type]"
                    >
                      {{ label }}
                    </option>
                  </select>
                </div>

                <div class="field-row">
                  <label>
                    <span>等级</span>
                    <select v-model.number="room.level" @change="onLevelChange(room)">
                      <option :value="1">Lv.1</option>
                      <option :value="2">Lv.2</option>
                      <option :value="3">Lv.3</option>
                    </select>
                  </label>
                  <button class="operator-select-button" type="button" @click="openRoomPicker(room)">
                    <span>选择干员</span>
                    <b>{{ room.operatorIds.length }}/{{ capacity(room) }}</b>
                  </button>
                </div>

                <div class="operator-chips" :class="{ empty: room.operatorIds.length === 0 }">
                  <template v-if="room.operatorIds.length">
                    <span v-for="id in room.operatorIds" :key="id" class="operator-chip">{{ operatorName(id) }}</span>
                  </template>
                  <span v-else>当前空置</span>
                </div>
                <div v-if="room.operatorIds.length" class="morale-inputs">
                  <label v-for="id in room.operatorIds" :key="id">
                    <span>{{ operatorName(id) }}</span>
                    <input type="number" min="0" max="24" step="1" :value="moraleOf(id)" @input="setMorale(id, $event)" />
                    <b>/24</b>
                  </label>
                </div>

                <label v-if="room.type === 'manufacture'" class="wide-field">
                  <span>制造方案</span>
                  <select v-model="room.product">
                    <option value="gold">赤金 · 72 分钟</option>
                    <option value="exp">中级作战记录 · 180 分钟</option>
                    <option value="fragment">源石碎片 · 60 分钟</option>
                  </select>
                </label>

                <template v-if="room.type === 'trading'">
                  <label class="wide-field">
                    <span>谈判策略</span>
                    <select v-model="room.strategy">
                      <option value="gold">龙门商法</option>
                      <option value="orundum" :disabled="room.level < 3">开采协力</option>
                    </select>
                  </label>
                  <div v-if="room.strategy === 'gold'" class="field-row">
                    <label>
                      <span>订单品质</span>
                      <select v-model="room.quality">
                        <option v-for="(label, key) in qualityLabels" :key="key" :value="key">{{ label }}</option>
                      </select>
                    </label>
                    <label>
                      <span>特殊订单</span>
                      <select v-model="room.specialOrder">
                        <option v-for="(label, key) in specialLabels" :key="key" :value="key">{{ label }}</option>
                      </select>
                    </label>
                  </div>
                </template>

                <label class="bonus-field">
                  <span>手动效率修正</span>
                  <div>
                    <input v-model.number="room.skillBonus" type="number" min="-100" max="400" step="1" />
                    <b>%</b>
                  </div>
                </label>
              </article>
            </div>
          </section>

          <section class="panel group-panel">
            <div class="section-heading">
              <div>
                <p class="section-kicker">SHIFT GROUPS</p>
                <h2>干员组合</h2>
              </div>
              <div class="group-heading-actions">
                <p>组合可跨越不同设施；预测起点同步进驻，任一成员心情耗尽时全组同步离开。</p>
                <button class="group-add-button" type="button" @click="addOperatorGroup">+ 新建组合</button>
              </div>
            </div>

            <div v-if="config.operatorGroups.length" class="group-list">
              <article v-for="group in config.operatorGroups" :key="group.id" class="group-card">
                <div class="group-card-head">
                  <input v-model.trim="group.name" aria-label="组合名称" maxlength="24" />
                  <span :class="{ ready: group.operatorIds.length >= 2 }">
                    {{ group.operatorIds.length >= 2 ? `${group.operatorIds.length} 人 · 已生效` : '至少选择 2 人' }}
                  </span>
                  <button type="button" @click="removeOperatorGroup(group)">删除</button>
                </div>
                <div v-if="assignedOperators.length" class="group-member-grid">
                  <label
                    v-for="operator in assignedOperators"
                    :key="operator.id"
                    class="group-member"
                    :class="{
                      selected: group.operatorIds.includes(operator.id),
                      unavailable: groupMembership[operator.id] && groupMembership[operator.id] !== group.id,
                    }"
                  >
                    <input
                      type="checkbox"
                      :checked="group.operatorIds.includes(operator.id)"
                      :disabled="Boolean(groupMembership[operator.id] && groupMembership[operator.id] !== group.id)"
                      @change="toggleGroupMember(group, operator.id, $event)"
                    />
                    <span><b>{{ operator.name }}</b><small>{{ operator.location }}</small></span>
                  </label>
                </div>
                <p v-else class="group-empty">请先向控制中枢或产出设施进驻干员。</p>
              </article>
            </div>
            <div v-else class="group-empty-state">
              <strong>尚未建立同步组合</strong>
              <span>组合不会限制设施类型，可将控制中枢、制造站、贸易站和发电站干员编入同一组。</span>
            </div>
          </section>

          <section class="panel facility-panel">
            <div class="section-heading compact">
              <div>
                <p class="section-kicker">FACILITY LOAD</p>
                <h2>功能设施与宿舍</h2>
              </div>
              <p>这些设施暂不折算收益，但会计入电力。</p>
            </div>
            <div class="control-assignment">
              <div>
                <span class="control-label">控制中枢 · 全局联动</span>
                <div class="operator-chips" :class="{ empty: config.controlOperatorIds.length === 0 }">
                  <template v-if="config.controlOperatorIds.length">
                    <span v-for="id in config.controlOperatorIds" :key="id" class="operator-chip">{{ operatorName(id) }}</span>
                  </template>
                  <span v-else>未选择控制中枢干员</span>
                </div>
                <div v-if="config.controlOperatorIds.length" class="morale-inputs">
                  <label v-for="id in config.controlOperatorIds" :key="id">
                    <span>{{ operatorName(id) }}</span>
                    <input type="number" min="0" max="24" step="1" :value="moraleOf(id)" @input="setMorale(id, $event)" />
                    <b>/24</b>
                  </label>
                </div>
              </div>
              <button class="operator-select-button control-button" type="button" @click="openControlPicker">
                <span>选择干员</span>
                <b>{{ config.controlOperatorIds.length }}/5</b>
              </button>
            </div>
            <div class="facility-grid">
              <label>
                <span>会客室</span>
                <select v-model.number="config.facilities.reception">
                  <option v-for="level in 3" :key="level" :value="level">Lv.{{ level }}</option>
                </select>
              </label>
              <label>
                <span>办公室</span>
                <select v-model.number="config.facilities.office">
                  <option v-for="level in 3" :key="level" :value="level">Lv.{{ level }}</option>
                </select>
              </label>
              <label>
                <span>训练室</span>
                <select v-model.number="config.facilities.training">
                  <option v-for="level in 3" :key="level" :value="level">Lv.{{ level }}</option>
                </select>
              </label>
              <label>
                <span>加工站</span>
                <select v-model.number="config.facilities.workshop">
                  <option v-for="level in 3" :key="level" :value="level">Lv.{{ level }} · 10 电力</option>
                </select>
              </label>
              <label v-for="(_, index) in config.facilities.dormitories" :key="index">
                <span>宿舍 {{ index + 1 }}</span>
                <select v-model.number="config.facilities.dormitories[index]">
                  <option v-for="level in 5" :key="level" :value="level">Lv.{{ level }}</option>
                </select>
              </label>
              <label>
                <span>宿舍当前进驻人数</span>
                <input
                  v-model.number="config.dormitoryOccupantCount"
                  type="number"
                  min="0"
                  :max="config.facilities.dormitories.length * 5"
                  step="1"
                />
              </label>
            </div>
          </section>
        </div>

        <aside class="results-column">
          <section class="power-console" :class="{ danger: !report.power.sufficient }">
            <div class="power-head">
              <div>
                <p>POWER BALANCE</p>
                <h2>{{ report.power.sufficient ? '供电稳定' : '供电不足' }}</h2>
              </div>
              <div class="power-margin">{{ report.power.margin >= 0 ? '+' : '' }}{{ report.power.margin }}</div>
            </div>
            <div class="power-track"><i :style="{ width: `${powerPercent}%` }"></i></div>
            <div class="power-numbers">
              <span>发电 <b>{{ report.power.generation }}</b></span>
              <span>耗电 <b>{{ report.power.consumption }}</b></span>
            </div>
            <p v-if="!report.power.sufficient" class="power-warning">
              缺少 {{ Math.abs(report.power.margin) }} 电力。收益暂停计算，配置仍可继续编辑。
            </p>
          </section>

          <section class="panel drone-panel">
            <div class="drone-stat">
              <span>理论无人机</span>
              <strong>{{ format(report.drones) }}</strong>
              <small>{{ config.hours }} 小时 · 每架减少 3 分钟</small>
            </div>
            <label>
              <span>全部无人机用于</span>
              <select v-model="config.droneTarget">
                <option value="none">不计入产出</option>
                <option v-for="room in config.rooms.filter((item) => item.type !== 'power')" :key="room.id" :value="room.id">
                  {{ room.id }} · {{ ROOM_LABELS[room.type] }}
                </option>
              </select>
            </label>
          </section>

          <section class="panel income-panel">
            <div class="section-heading compact">
              <div>
                <p class="section-kicker">DAILY YIELD</p>
                <h2>平均产出</h2>
              </div>
              <span class="deterministic-badge">确定性期望</span>
            </div>

            <div v-if="report.summary" class="metric-list">
              <div class="metric exp">
                <span>作战记录</span>
                <strong>{{ format(report.summary.exp, 0) }}</strong>
                <small>EXP</small>
              </div>
              <div class="metric gold">
                <span>赤金制造</span>
                <strong>{{ format(report.summary.goldCount) }}</strong>
                <small>条 · 价值 {{ format(report.summary.goldValue, 0) }} 龙门币</small>
              </div>
              <div class="metric lmd">
                <span>订单收入</span>
                <strong>{{ format(report.summary.orderLmd, 0) }}</strong>
                <small>龙门币 · 消耗 {{ format(report.summary.goldConsumed) }} 赤金</small>
              </div>
              <div class="metric fragment">
                <span>源石碎片</span>
                <strong>{{ format(report.summary.fragments) }}</strong>
                <small>个</small>
              </div>
              <div class="metric orundum">
                <span>合成玉</span>
                <strong>{{ format(report.summary.orundum, 0) }}</strong>
                <small>消耗 {{ format(report.summary.fragmentsConsumed) }} 碎片</small>
              </div>
            </div>
            <div v-else class="blocked-result">
              <div>!</div>
              <h3>当前方案无法计算收益</h3>
              <p v-if="!report.power.sufficient">请降低设施耗电或增加/升级发电站。</p>
              <ul v-if="report.validationMessages.length">
                <li v-for="message in report.validationMessages" :key="message">{{ message }}</li>
              </ul>
            </div>
          </section>

          <section class="panel detail-panel">
            <div class="section-heading compact">
              <div>
                <p class="section-kicker">TRACE</p>
                <h2>设施明细</h2>
              </div>
            </div>
            <div class="detail-list">
              <div v-for="item in report.manufacture" :key="item.roomId">
                <span>{{ item.roomId }} · {{ productLabels[item.product] }}</span>
                <b>{{ format(item.count) }}</b>
                <small>效率 {{ format(item.efficiency * 100, 0) }}%<template v-if="item.droneExtra"> · 无人机 +{{ format(item.droneExtra) }}</template></small>
                <small v-if="item.operatorNames.length" class="detail-operators">{{ item.operatorNames.join(' / ') }}</small>
                <small v-for="detail in item.buffDetails" :key="detail" class="detail-buff">{{ detail }}</small>
                <small v-if="item.unquantifiedSkills.length" class="detail-unquantified">
                  待量化：{{ item.unquantifiedSkills.join('、') }}
                </small>
              </div>
              <div v-for="item in report.trading" :key="item.roomId">
                <span>{{ item.roomId }} · {{ item.strategy === 'gold' ? '龙门商法' : '开采协力' }}</span>
                <b>{{ format(item.orders) }} 单</b>
                <small>效率 {{ format(item.efficiency * 100, 0) }}%<template v-if="item.droneExtraOrders"> · 无人机 +{{ format(item.droneExtraOrders) }} 单</template></small>
                <small v-if="item.operatorNames.length" class="detail-operators">{{ item.operatorNames.join(' / ') }}</small>
                <small v-for="detail in item.buffDetails" :key="detail" class="detail-buff">{{ detail }}</small>
                <small v-if="item.unquantifiedSkills.length" class="detail-unquantified">
                  待量化：{{ item.unquantifiedSkills.join('、') }}
                </small>
              </div>
            </div>
          </section>

          <section v-if="report.morale.length" class="panel morale-panel">
            <div class="section-heading compact">
              <div>
                <p class="section-kicker">MORALE TIMELINE</p>
                <h2>心情预测</h2>
              </div>
            </div>
            <div class="morale-list">
              <div v-for="item in report.morale" :key="item.operatorId">
                <span>{{ item.operatorName }} · {{ item.roomId }}</span>
                <b>{{ format(item.initial, 1) }} → {{ format(item.ending, 1) }}</b>
                <small>
                  初始消耗 {{ format(item.initialConsumptionPerHour, 2) }}/时
                  <template v-if="item.leaveReason === 'morale-exhausted'"> · {{ format(item.leftAt ?? 0, 1) }} 小时后耗尽并离开</template>
                  <template v-else-if="item.leaveReason === 'group-sync'"> · {{ format(item.leftAt ?? 0, 1) }} 小时后随组合「{{ item.groupName }}」离开</template>
                  <template v-else> · 预测期内持续工作</template>
                </small>
                <small
                  v-for="detail in item.details"
                  :key="detail"
                  class="morale-detail"
                >
                  {{ detail }}
                </small>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>

    <footer>
      <span>{{ EDITION.label }} · 组合规则引擎 v0.3.0</span>
      <span>本地保存 · 不上传配置</span>
      <span>GameData {{ GAME_DATA_VERSION }} · {{ OPERATOR_PROFILE_COUNT }} 份基建档案</span>
    </footer>

    <OperatorPicker
      :open="picker.open"
      :target-label="picker.targetLabel"
      :room-type="picker.roomType"
      :capacity="picker.capacity"
      :selected-ids="picker.selectedIds"
      :assigned-to="assignedTo"
      @close="picker.open = false"
      @apply="applyOperators"
    />
  </div>
</template>
