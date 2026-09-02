<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import InlineOperatorSelect from './components/InlineOperatorSelect.vue'
import { createDefaultConfig, createRoom, ROOM_LABELS, ROOM_LIMITS } from './domain/defaults'
import { EDITION } from './domain/edition'
import { GAME_DATA_VERSION, OPERATOR_MAP, OPERATOR_PROFILE_COUNT } from './domain/operators'
import type { AppConfig, OutputRoom, RoomType, SpecialOrder } from './domain/types'
import { calculate } from './engine/calculate'
import { assignOperatorToNamedGroup, setRosterSlot } from './engine/rosterEditor'

type FacilityKind = 'output' | 'control' | 'dormitory' | 'support'
type FacilityRoomType =
  | RoomType
  | 'control'
  | 'dormitory'
  | 'meeting'
  | 'workshop'
  | 'training'
  | 'hire'

interface FacilityTarget {
  id: string
  label: string
  kind: FacilityKind
  roomType: FacilityRoomType
  operatorIds: string[]
  level: number | null
  maxLevel: number
  capacity: number
}

const STORAGE_KEY = `arc-income-calculator-config-v7-${EDITION.storageNamespace}`
const LEGACY_STORAGE_KEYS = [
  `arc-income-calculator-config-v6-${EDITION.storageNamespace}`,
  `arc-income-calculator-config-v5-${EDITION.storageNamespace}`,
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
      if (
        (parsed.schemaVersion === 4 ||
          parsed.schemaVersion === 5 ||
          parsed.schemaVersion === 6 ||
          parsed.schemaVersion === 7) &&
        parsed.rooms?.length === 9
      ) {
        const previousSchemaVersion = parsed.schemaVersion
        const migrated = parsed as unknown as AppConfig
        migrated.schemaVersion = 7
        migrated.dormitoryOccupantCount ??= 0
        const storedEfficiencyResources = migrated.efficiencyResources as
          | Partial<AppConfig['efficiencyResources']>
          | undefined
        migrated.efficiencyResources = {
          manufacturePerceptionInformation: 0,
          tradingPerceptionInformation: 0,
          additionalGoldProductionLines: 0,
          monsterCuisine: 0,
          worldlyFireworks: 0,
          suiFacilities: 0,
          droneCapacity: 235,
          extraWorkplaceOperatorIds: [],
          trainingOperatorIds: [],
          ...storedEfficiencyResources,
        }
        migrated.efficiencyResources.droneCapacity = 235
        if (previousSchemaVersion < 7) {
          if (migrated.efficiencyResources.manufacturePerceptionInformation > 0) {
            migrated.efficiencyResources.manufacturePerceptionInformation +=
              migrated.dormitoryOccupantCount
          }
          if (migrated.efficiencyResources.tradingPerceptionInformation > 0) {
            migrated.efficiencyResources.tradingPerceptionInformation +=
              migrated.dormitoryOccupantCount
          }
        }
        migrated.facilityOperatorIds ??= {
          dormitories: [[], [], [], []],
          reception: [],
          workshop: [],
          office: [],
          training: [],
        }
        migrated.facilityOperatorIds.dormitories = Array.from(
          { length: migrated.facilities.dormitories.length },
          (_, index) => migrated.facilityOperatorIds.dormitories[index] ?? [],
        )
        migrated.operatorGroups ??= []
        migrated.operatorBackups ??= {}
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
const selectedRosterTarget = ref('B1')
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
  config.facilityOperatorIds.dormitories.forEach((operatorIds, index) => {
    for (const id of operatorIds) assignments[id] = `宿舍 ${index + 1}`
  })
  for (const id of config.facilityOperatorIds.reception) assignments[id] = '会客室'
  for (const id of config.facilityOperatorIds.workshop) assignments[id] = '加工站'
  for (const id of config.facilityOperatorIds.office) assignments[id] = '办公室'
  for (const id of config.facilityOperatorIds.training) assignments[id] = '训练室'
  return assignments
})
const reservedOperators = computed(() => {
  const reserved = { ...assignedTo.value }
  for (const [primaryId, backupId] of Object.entries(config.operatorBackups)) {
    if (backupId) reserved[backupId] ??= `${operatorName(primaryId)} 的替补`
  }
  return reserved
})
const outputTargets = computed<FacilityTarget[]>(() => config.rooms.map((room) => ({
  id: room.id,
  label: `${room.id} · ${ROOM_LABELS[room.type]}`,
  kind: 'output',
  roomType: room.type,
  operatorIds: room.operatorIds,
  level: room.level,
  maxLevel: 3,
  capacity: capacity(room),
})))
const centerTargets = computed<FacilityTarget[]>(() => [
  {
    id: 'control', label: '控制中枢', kind: 'control', roomType: 'control',
    operatorIds: config.controlOperatorIds, level: null, maxLevel: 0, capacity: 5,
  },
  ...config.facilities.dormitories.map((level, index) => ({
    id: `dormitory-${index + 1}`,
    label: `宿舍 ${index + 1}`,
    kind: 'dormitory' as const,
    roomType: 'dormitory' as const,
    operatorIds: config.facilityOperatorIds.dormitories[index] ?? [],
    level,
    maxLevel: 5,
    capacity: 5,
  })),
])
const supportTargets = computed<FacilityTarget[]>(() => [
  { id: 'reception', label: '会客室', kind: 'support', roomType: 'meeting', operatorIds: config.facilityOperatorIds.reception, level: config.facilities.reception, maxLevel: 3, capacity: 2 },
  { id: 'workshop', label: '加工站', kind: 'support', roomType: 'workshop', operatorIds: config.facilityOperatorIds.workshop, level: config.facilities.workshop, maxLevel: 3, capacity: 1 },
  { id: 'office', label: '办公室', kind: 'support', roomType: 'hire', operatorIds: config.facilityOperatorIds.office, level: config.facilities.office, maxLevel: 3, capacity: 1 },
  { id: 'training', label: '训练室', kind: 'support', roomType: 'training', operatorIds: config.facilityOperatorIds.training, level: config.facilities.training, maxLevel: 3, capacity: 2 },
])
const rosterTargets = computed(() => [...outputTargets.value, ...centerTargets.value, ...supportTargets.value])
const selectedRoster = computed(() => rosterTargets.value.find((target) => target.id === selectedRosterTarget.value) ?? rosterTargets.value[0]!)
const selectedOutputRoom = computed(() => config.rooms.find((room) => room.id === selectedRoster.value.id) ?? null)
const selectedRosterSlots = computed(() => Array.from(
  { length: selectedRoster.value.capacity },
  (_, index) => selectedRoster.value.operatorIds[index] ?? '',
))
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
  const assigned = new Set([
    ...config.controlOperatorIds,
    ...config.rooms.flatMap((item) => item.operatorIds),
    ...config.facilityOperatorIds.dormitories.flat(),
    ...config.facilityOperatorIds.reception,
    ...config.facilityOperatorIds.workshop,
    ...config.facilityOperatorIds.office,
    ...config.facilityOperatorIds.training,
  ])
  const retainedBackups: Record<string, string> = {}
  const claimed = new Set<string>()
  for (const primaryId of assigned) {
    const backupId = config.operatorBackups[primaryId]
    if (backupId && !assigned.has(backupId) && !claimed.has(backupId)) {
      retainedBackups[primaryId] = backupId
      claimed.add(backupId)
    }
  }
  config.operatorBackups = retainedBackups
  const scheduled = new Set([...assigned, ...Object.values(retainedBackups)])
  config.zeroMoraleOperatorIds = config.zeroMoraleOperatorIds.filter((id) => scheduled.has(id))
  for (const group of config.operatorGroups) {
    group.operatorIds = group.operatorIds.filter((id) => assigned.has(id))
  }
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

function setSelectedFacilityLevel(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  const target = selectedRoster.value
  if (target.kind === 'output' && selectedOutputRoom.value) {
    selectedOutputRoom.value.level = value as 1 | 2 | 3
    onLevelChange(selectedOutputRoom.value)
    return
  }
  if (target.kind === 'dormitory') {
    const index = Number(target.id.split('-')[1]) - 1
    config.facilities.dormitories[index] = value as 1 | 2 | 3 | 4 | 5
    return
  }
  if (target.kind !== 'support') return
  if (target.id === 'reception') config.facilities.reception = value as 1 | 2 | 3
  if (target.id === 'workshop') config.facilities.workshop = value as 1 | 2 | 3
  if (target.id === 'office') config.facilities.office = value as 1 | 2 | 3
  if (target.id === 'training') config.facilities.training = value as 1 | 2 | 3
}

function setPrimaryAtSlot(slotIndex: number, operatorId: string) {
  const currentIds = [...selectedRoster.value.operatorIds]
  const result = setRosterSlot(currentIds, selectedRoster.value.capacity, slotIndex, operatorId)
  if (selectedRoster.value.kind === 'control') {
    config.controlOperatorIds = result.operatorIds
  } else if (selectedOutputRoom.value) {
    selectedOutputRoom.value.operatorIds = result.operatorIds
    selectedOutputRoom.value.operatorCount = result.operatorIds.length
    selectedOutputRoom.value.powerStaffed = result.operatorIds.length > 0
  } else if (selectedRoster.value.kind === 'dormitory') {
    const index = Number(selectedRoster.value.id.split('-')[1]) - 1
    config.facilityOperatorIds.dormitories[index] = result.operatorIds
  } else if (selectedRoster.value.id === 'reception') {
    config.facilityOperatorIds.reception = result.operatorIds
  } else if (selectedRoster.value.id === 'workshop') {
    config.facilityOperatorIds.workshop = result.operatorIds
  } else if (selectedRoster.value.id === 'office') {
    config.facilityOperatorIds.office = result.operatorIds
  } else if (selectedRoster.value.id === 'training') {
    config.facilityOperatorIds.training = result.operatorIds
  }
  if (result.removedOperatorId) {
    delete config.operatorBackups[result.removedOperatorId]
    config.operatorGroups = assignOperatorToNamedGroup(
      config.operatorGroups,
      result.removedOperatorId,
      '',
      () => '',
    )
  }
  if (operatorId) config.operatorMorale[operatorId] ??= 24
  pruneZeroMorale()
}

function setBackupOperator(primaryOperatorId: string, backupOperatorId: string) {
  if (backupOperatorId) {
    config.operatorBackups[primaryOperatorId] = backupOperatorId
    config.operatorMorale[backupOperatorId] ??= 24
  } else {
    delete config.operatorBackups[primaryOperatorId]
  }
  pruneZeroMorale()
}

function operatorGroupName(operatorId: string) {
  const groupId = groupMembership.value[operatorId]
  return config.operatorGroups.find((group) => group.id === groupId)?.name ?? ''
}

function setOperatorGroupName(operatorId: string, groupName: string) {
  config.operatorGroups = assignOperatorToNamedGroup(
    config.operatorGroups,
    operatorId,
    groupName,
    () => `group-${Date.now()}-${operatorId}`,
  )
}

function groupColor(operatorId: string) {
  const groupId = groupMembership.value[operatorId]
  const index = config.operatorGroups.findIndex((group) => group.id === groupId)
  return index < 0 ? 'transparent' : `hsl(${(index * 67 + 168) % 360} 72% 54%)`
}

function backupOf(primaryId: string) {
  return config.operatorBackups[primaryId] ?? ''
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
          <span>长期日均模拟</span>
          <strong>预热 30 天 · 统计 90 天</strong>
        </div>
      </section>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>

      <div class="workspace">
        <div class="editor-column">
          <section class="panel base-plan-panel">
            <div class="section-heading base-plan-heading">
              <div>
                <p class="section-kicker">BASE PLAN</p>
                <h2>基建排班图</h2>
              </div>
              <p>先从基建平面图选择设施，再在下方同一张表内编辑设施参数、主力、组合与替补。</p>
            </div>

            <div class="base-map" aria-label="基建设施选择器">
              <div class="base-output-grid">
                <button
                  v-for="target in outputTargets"
                  :key="target.id"
                  type="button"
                  class="base-room"
                  :class="[target.roomType, { selected: selectedRosterTarget === target.id }]"
                  @click="selectedRosterTarget = target.id"
                >
                  <span class="base-room-title"><b>{{ target.id }}</b>{{ ROOM_LABELS[target.roomType as RoomType] }}</span>
                  <span class="base-room-level">Lv.{{ target.level }}</span>
                  <span class="base-room-operators">
                    <i
                      v-for="id in target.operatorIds"
                      :key="id"
                      :style="{ borderBottomColor: groupColor(id) }"
                      :title="operatorName(id)"
                    >{{ operatorName(id).slice(0, 2) }}</i>
                    <em v-if="!target.operatorIds.length">空</em>
                  </span>
                </button>
              </div>

              <div class="base-center-stack">
                <button
                  v-for="target in centerTargets"
                  :key="target.id"
                  type="button"
                  class="base-room center"
                  :class="[target.kind, { selected: selectedRosterTarget === target.id }]"
                  @click="selectedRosterTarget = target.id"
                >
                  <span class="base-room-title">{{ target.label }}</span>
                  <span v-if="target.level" class="base-room-level">Lv.{{ target.level }}</span>
                  <span class="base-room-operators">
                    <i
                      v-for="id in target.operatorIds"
                      :key="id"
                      :style="{ borderBottomColor: groupColor(id) }"
                      :title="operatorName(id)"
                    >{{ operatorName(id).slice(0, 2) }}</i>
                    <em v-if="target.kind === 'control' && !target.operatorIds.length">空</em>
                  </span>
                </button>
              </div>

              <div class="base-support-stack">
                <button
                  v-for="target in supportTargets"
                  :key="target.id"
                  type="button"
                  class="base-room support"
                  :class="{ selected: selectedRosterTarget === target.id }"
                  @click="selectedRosterTarget = target.id"
                >
                  <span class="base-room-title">{{ target.label }}</span>
                  <span class="base-room-level">Lv.{{ target.level }}</span>
                </button>
              </div>
            </div>

            <div class="facility-editor">
              <div class="facility-editor-head">
                <div>
                  <span>正在编辑</span>
                  <strong>{{ selectedRoster.label }}</strong>
                </div>
                <span v-if="selectedRoster.capacity" class="slot-capacity">{{ selectedRoster.operatorIds.length }}/{{ selectedRoster.capacity }} 已进驻</span>
              </div>

              <div class="facility-parameters">
                <template v-if="selectedOutputRoom">
                  <label>
                    <span>设施类型</span>
                    <select :value="selectedOutputRoom.type" @change="handleTypeChange(selectedOutputRoom, $event)">
                      <option
                        v-for="(label, type) in ROOM_LABELS"
                        :key="type"
                        :value="type"
                        :disabled="selectedOutputRoom.type !== type && counts[type] >= ROOM_LIMITS[type]"
                      >{{ label }}</option>
                    </select>
                  </label>
                  <label>
                    <span>等级</span>
                    <select :value="selectedOutputRoom.level" @change="setSelectedFacilityLevel">
                      <option v-for="level in 3" :key="level" :value="level">Lv.{{ level }}</option>
                    </select>
                  </label>
                  <label v-if="selectedOutputRoom.type === 'manufacture'">
                    <span>制造方案</span>
                    <select v-model="selectedOutputRoom.product">
                      <option value="gold">赤金 · 72 分钟</option>
                      <option value="exp">中级作战记录 · 180 分钟</option>
                      <option value="fragment">源石碎片 · 60 分钟</option>
                    </select>
                  </label>
                  <label v-if="selectedOutputRoom.type === 'trading'">
                    <span>谈判策略</span>
                    <select v-model="selectedOutputRoom.strategy">
                      <option value="gold">龙门商法</option>
                      <option value="orundum" :disabled="selectedOutputRoom.level < 3">开采协力</option>
                    </select>
                  </label>
                  <label v-if="selectedOutputRoom.type === 'trading' && selectedOutputRoom.strategy === 'gold'">
                    <span>订单品质</span>
                    <select v-model="selectedOutputRoom.quality">
                      <option v-for="(label, key) in qualityLabels" :key="key" :value="key">{{ label }}</option>
                    </select>
                  </label>
                  <label v-if="selectedOutputRoom.type === 'trading' && selectedOutputRoom.strategy === 'gold'">
                    <span>特殊订单</span>
                    <select v-model="selectedOutputRoom.specialOrder">
                      <option v-for="(label, key) in specialLabels" :key="key" :value="key">{{ label }}</option>
                    </select>
                  </label>
                </template>
                <label v-else-if="selectedRoster.level !== null">
                  <span>设施等级</span>
                  <select :value="selectedRoster.level" @change="setSelectedFacilityLevel">
                    <option v-for="level in selectedRoster.maxLevel" :key="level" :value="level">Lv.{{ level }}</option>
                  </select>
                </label>
                <label v-if="selectedRoster.kind === 'dormitory'">
                  <span>全部宿舍当前人数</span>
                  <input
                    v-model.number="config.dormitoryOccupantCount"
                    type="number"
                    min="0"
                    :max="config.facilities.dormitories.length * 5"
                    step="1"
                  />
                </label>
                <p v-if="selectedRoster.kind === 'support'" class="parameter-note">功能设施干员会参与跨设施技能与中间资源计算。</p>
              </div>

              <div v-if="selectedRoster.capacity > 0" class="roster-table">
                <div class="roster-table-head">
                  <span>工位</span><span>干员</span><span>组</span><span>替换</span>
                </div>
                <article v-for="(primaryId, index) in selectedRosterSlots" :key="`${selectedRoster.id}-${index}`" class="roster-table-row">
                  <span class="slot-index">{{ String(index + 1).padStart(2, '0') }}</span>
                  <div class="roster-person primary-person" :style="{ borderBottomColor: groupColor(primaryId) }">
                    <InlineOperatorSelect
                      :model-value="primaryId"
                      :room-type="selectedRoster.roomType"
                      :assigned-to="reservedOperators"
                      placeholder="选择干员"
                      @update:model-value="setPrimaryAtSlot(index, $event)"
                    />
                    <label v-if="primaryId">心情 <input type="number" min="0" max="24" step="1" :value="moraleOf(primaryId)" @input="setMorale(primaryId, $event)" /></label>
                  </div>
                  <label class="group-cell">
                    <input
                      :value="operatorGroupName(primaryId)"
                      :disabled="!primaryId"
                      :list="`group-options-${selectedRoster.id}-${index}`"
                      placeholder="组名"
                      maxlength="24"
                      @change="setOperatorGroupName(primaryId, ($event.target as HTMLInputElement).value)"
                    />
                    <datalist :id="`group-options-${selectedRoster.id}-${index}`">
                      <option v-for="group in config.operatorGroups" :key="group.id" :value="group.name" />
                    </datalist>
                  </label>
                  <div class="roster-person backup" :class="{ missing: primaryId && !backupOf(primaryId) }">
                    <InlineOperatorSelect
                      :model-value="backupOf(primaryId)"
                      :room-type="selectedRoster.roomType"
                      :assigned-to="reservedOperators"
                      :disabled="!primaryId"
                      placeholder="选择替补"
                      @update:model-value="setBackupOperator(primaryId, $event)"
                    />
                    <label v-if="backupOf(primaryId)">心情 <input type="number" min="0" max="24" step="1" :value="moraleOf(backupOf(primaryId))" @input="setMorale(backupOf(primaryId), $event)" /></label>
                  </div>
                </article>
                <p class="roster-hint">主力、组名与替补会立即保存；跨设施输入相同组名即可同步排班。</p>
              </div>
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
              <small>长期日均 · 每架减少 3 分钟</small>
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
                <span>{{ item.operatorName }} · {{ item.roomId }} · {{ item.role === 'backup' ? '替补' : '主力' }}</span>
                <b>{{ format(item.initial, 1) }} → {{ format(item.ending, 1) }}</b>
                <small>
                  初始消耗 {{ format(item.initialConsumptionPerHour, 2) }}/时
                  <template v-if="item.role === 'backup' && item.startedAt === null"> · 预测期内待命，未接班</template>
                  <template v-else-if="item.role === 'backup'"> · 第 {{ format(item.startedAt ?? 0, 1) }} 小时接班</template>
                  <template v-else-if="item.leaveReason === 'morale-exhausted'"> · {{ format(item.leftAt ?? 0, 1) }} 小时后耗尽并离开</template>
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

  </div>
</template>
