<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import { validateRosterWorkspace, type ValidationResult } from '../../workbench/validate'
import { EDITION } from '../../domain/edition'
import { GAME_DATA_VERSION, OPERATOR_PROFILE_COUNT } from '../../domain/operators'
import { migrateAppConfigToWorkspace } from '../../workbench/migrate'
import type { MowerRoomId, RosterWorkspace } from '../../workbench/model'
import type { AppConfig, CalculationReport } from '../../domain/types'
import { runCalculationBridge } from '../../workbench/calculationBridge'

import PlanToolbar from './PlanToolbar.vue'
import BaseMap from './BaseMap.vue'
import FacilityEditor from './FacilityEditor.vue'
import PolicyEditor from './PolicyEditor.vue'
import ValidationPanel, { type ValidationFocusPayload } from './ValidationPanel.vue'
import OperatorSelectModal, { type OperatorSelectionPayload } from './OperatorSelectModal.vue'
import GlobalReplaceModal, { type GlobalReplacePayload } from './GlobalReplaceModal.vue'
import '../../workbench/styles.css'

const store = useRosterWorkbenchStore()

// Component and DOM references
const baseMapRef = ref<InstanceType<typeof BaseMap> | null>(null)
const facilityEditorSectionRef = ref<HTMLElement | null>(null)
const policyEditorSectionRef = ref<HTMLElement | null>(null)

// Operator picker modal state
const pickerOpen = ref(false)
const pickerMode = ref<'main' | 'replacement'>('main')
const pickerRoomId = ref<MowerRoomId>('room_1_1')
const pickerSlotIndex = ref(0)

// Global replace modal state
const replaceModalOpen = ref(false)
const replaceStatusMessage = ref<string | null>(null)

// Calculation report and error state
const calculationReport = ref<CalculationReport | null>(null)
const calculationError = ref<string | null>(null)

// Computed base map export DOM element for PlanToolbar JPG capture
const baseMapElement = computed<HTMLElement | null>(() => {
  if (baseMapRef.value?.outer) return baseMapRef.value.outer
  const el = (baseMapRef.value as unknown as { $el?: HTMLElement })?.$el
  if (el) {
    return el.querySelector<HTMLElement>('.plan-container') ?? el
  }
  return null
})

provide('baseMapElement', () => baseMapElement.value)

// Reactive validation result
const validationResult = computed<ValidationResult>(() => {
  return validateRosterWorkspace(store.workspace)
})

// Persistence keys matching existing store/edition pattern
const WORKSPACE_STORAGE_KEY = `arc-income-calculator-workspace-v8-${EDITION.storageNamespace}`
const V7_STORAGE_KEY = `arc-income-calculator-config-v7-${EDITION.storageNamespace}`
const REPORT_STORAGE_KEY = `arc-income-calculator-report-v1-${EDITION.storageNamespace}`

function initPersistence(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return

  try {
    const rawWs = localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (rawWs) {
      const parsed = JSON.parse(rawWs)
      if (parsed?.schemaVersion === 8 && parsed?.mainPlan?.facilities) {
        store.loadWorkspace(parsed as RosterWorkspace)
      }
    } else {
      const rawV7 = localStorage.getItem(V7_STORAGE_KEY)
      if (rawV7) {
        const parsedV7 = JSON.parse(rawV7)
        if (parsedV7?.schemaVersion === 7 && Array.isArray(parsedV7?.rooms)) {
          const migratedWs = migrateAppConfigToWorkspace(parsedV7 as AppConfig)
          store.loadWorkspace(migratedWs)
        }
      }
    }

    const rawRep = localStorage.getItem(REPORT_STORAGE_KEY)
    if (rawRep) {
      const parsedRep = JSON.parse(rawRep)
      if (parsedRep?.power) {
        calculationReport.value = parsedRep as CalculationReport
      }
    }
  } catch (e) {
    console.warn('Failed to restore persisted workbench state:', e)
  }
}

onMounted(() => {
  initPersistence()
})

// Persist workspace changes
watch(
  () => store.workspace,
  (ws) => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(ws))
    } catch {
      // ignore storage quota errors
    }
  },
  { deep: true },
)

// Persist calculation report
watch(
  calculationReport,
  (rep) => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
    try {
      if (rep) {
        localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(rep))
      } else {
        localStorage.removeItem(REPORT_STORAGE_KEY)
      }
    } catch {
      // ignore
    }
  },
  { deep: true },
)

// Sync plan name changes to mainPlan.name
watch(
  () => store.workspace.name,
  (newName) => {
    if (newName && store.workspace.mainPlan) {
      store.workspace.mainPlan.name = newName
    }
  },
)

// Focus FacilityEditor when room selection changes
watch(
  () => store.selectedRoomId,
  (newRoomId, oldRoomId) => {
    if (newRoomId && newRoomId !== oldRoomId) {
      nextTick(() => {
        if (facilityEditorSectionRef.value?.scrollIntoView) {
          facilityEditorSectionRef.value.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      })
    }
  },
)

function handleRequestPicker(payload: {
  roomId: MowerRoomId
  slotIndex: number
  mode: 'main' | 'replacement'
}): void {
  pickerRoomId.value = payload.roomId
  pickerSlotIndex.value = payload.slotIndex
  pickerMode.value = payload.mode
  pickerOpen.value = true
}

function handlePickerSelected(_payload: OperatorSelectionPayload): void {
  pickerOpen.value = false
}

function handleOpenReplace(): void {
  replaceModalOpen.value = true
}

function handleGlobalReplaced(payload: GlobalReplacePayload): void {
  replaceModalOpen.value = false
  replaceStatusMessage.value = `已将干员「${payload.sourceName}」替换为「${payload.targetName}」，涉及 ${payload.impact.totalCount} 处位置。`
}

function handleValidationFocus(payload: ValidationFocusPayload): void {
  if (payload.roomId) {
    store.selectRoom(payload.roomId as MowerRoomId)
    nextTick(() => {
      if (facilityEditorSectionRef.value?.scrollIntoView) {
        facilityEditorSectionRef.value.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    })
  } else if (payload.policyKey) {
    nextTick(() => {
      if (policyEditorSectionRef.value?.scrollIntoView) {
        policyEditorSectionRef.value.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
      if (typeof document !== 'undefined') {
        const fieldEl = document.querySelector(`[data-field="${payload.policyKey}"]`)
        if (fieldEl && typeof (fieldEl as HTMLElement).scrollIntoView === 'function') {
          (fieldEl as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }
    })
  }
}

function handleFocusRoom(roomId: string): void {
  store.selectRoom(roomId as MowerRoomId)
  nextTick(() => {
    if (facilityEditorSectionRef.value?.scrollIntoView) {
      facilityEditorSectionRef.value.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  })
}

function handleReset(): void {
  calculationReport.value = null
  calculationError.value = null
  replaceStatusMessage.value = null
}

function handleImported(_workspace: RosterWorkspace): void {
  calculationReport.value = null
  calculationError.value = null
  replaceStatusMessage.value = null
}

function handleCalculate(): void {
  calculationError.value = null
  if (!validationResult.value.isValid) {
    calculationError.value = '排班存在阻断错误，请根据下方诊断信息修复后再计算。'
    return
  }

  try {
    const bridgeResult = runCalculationBridge(store.workspace)
    if (bridgeResult.success && bridgeResult.report) {
      calculationReport.value = bridgeResult.report
    } else {
      calculationError.value = bridgeResult.error ?? '收益计算未成功完成'
    }
  } catch (err: unknown) {
    calculationError.value = err instanceof Error ? err.message : String(err)
  }
}

function formatNumber(value: number | undefined | null, digits = 0): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

defineExpose({
  store,
  validationResult,
  calculationReport,
  calculationError,
  replaceStatusMessage,
  pickerOpen,
  pickerMode,
  pickerRoomId,
  pickerSlotIndex,
  replaceModalOpen,
  handleCalculate,
  handleReset,
  handleImported,
  handleRequestPicker,
  handlePickerSelected,
  handleGlobalReplaced,
  handleValidationFocus,
  handleFocusRoom,
  baseMapElement,
  baseMapRef,
})
</script>

<template>
  <div class="workbench-shell" data-test="workbench-shell">
    <!-- Top Header & Brand -->
    <header class="workbench-topbar">
      <div class="brand">
        <div class="brand-mark">R</div>
        <div class="brand-text">
          <p class="eyebrow">RHODES ISLAND · INFRASTRUCTURE</p>
          <h1>基建收益预测终端 <small>{{ EDITION.label }}</small></h1>
          <p class="edition-description">{{ EDITION.description }}</p>
        </div>
      </div>
      <div class="topbar-actions">
        <label class="plan-name-input-label">
          <span>方案名称</span>
          <input
            v-model="store.workspace.name"
            maxlength="32"
            class="plan-name-input"
            data-test="plan-name-input"
            placeholder="排班方案名称"
          />
        </label>
      </div>
    </header>

    <!-- Reachable Toolbar Section -->
    <div class="toolbar-sticky-wrapper">
      <div class="toolbar-scroll-container">
        <PlanToolbar
          :base-map-element="baseMapElement"
          :is-valid="validationResult.isValid"
          theme="dark"
          @open-replace="handleOpenReplace"
          @calculate="handleCalculate"
          @reset="handleReset"
          @imported="handleImported"
        />
      </div>
    </div>

    <!-- Main Content Flow -->
    <main class="workbench-main">
      <!-- Global Replace Success/Status Banner -->
      <div
        v-if="replaceStatusMessage"
        class="replace-status-banner"
        data-test="replace-status-banner"
      >
        <span class="replace-status-icon">✓</span>
        <span class="replace-status-text">{{ replaceStatusMessage }}</span>
        <button
          type="button"
          class="replace-status-close"
          aria-label="关闭提示"
          @click="replaceStatusMessage = null"
        >
          ×
        </button>
      </div>

      <!-- Validation Summary & Diagnostics -->
      <section class="validation-section" data-test="validation-section">
        <ValidationPanel
          :result="validationResult"
          @focus="handleValidationFocus"
          @focus-room="handleFocusRoom"
        />
      </section>

      <!-- Compact Calculation Results Panel -->
      <section
        v-if="calculationReport || calculationError"
        class="results-panel plan-container"
        data-test="results-panel"
      >
        <div class="results-panel-header">
          <div class="results-title-box">
            <span class="results-kicker">SIMULATION REPORT</span>
            <h3 class="results-title">基建收益测算结果</h3>
          </div>
          <div
            v-if="calculationReport"
            class="power-summary-badge"
            :class="{ 'is-danger': !calculationReport.power.sufficient }"
            data-test="results-power-badge"
          >
            <span>发电: {{ calculationReport.power.generation }}</span>
            <span>耗电: {{ calculationReport.power.consumption }}</span>
            <span class="power-margin-text">
              余量: {{ calculationReport.power.margin >= 0 ? '+' : '' }}{{ calculationReport.power.margin }}
            </span>
            <span class="power-tag">
              {{ calculationReport.power.sufficient ? '供电充足' : '供电不足' }}
            </span>
          </div>
        </div>

        <div v-if="calculationError" class="results-error-box" data-test="calculation-error">
          <span class="error-icon">✕</span>
          <span>{{ calculationError }}</span>
        </div>

        <div
          v-else-if="calculationReport && !calculationReport.summary"
          class="results-blocked-box"
          data-test="results-blocked"
        >
          <div class="blocked-head">
            <span class="blocked-icon">⚠</span>
            <strong>当前排班未通过校验，无法生成产出数值</strong>
          </div>
          <ul
            v-if="calculationReport.validationMessages && calculationReport.validationMessages.length > 0"
            class="blocked-list"
          >
            <li v-for="msg in calculationReport.validationMessages" :key="msg">{{ msg }}</li>
          </ul>
        </div>

        <div
          v-else-if="calculationReport && calculationReport.summary"
          class="results-grid"
          data-test="results-metrics"
        >
          <!-- Daily LMD Yield -->
          <div class="metric-card card-lmd" data-test="metric-lmd">
            <span class="metric-tag">贸易收益</span>
            <div class="metric-main">
              <span class="metric-num">{{ formatNumber(calculationReport.summary.orderLmd) }}</span>
              <span class="metric-unit">龙门币/日</span>
            </div>
            <span class="metric-sub">日消耗赤金 {{ formatNumber(calculationReport.summary.goldConsumed, 1) }} 条</span>
          </div>

          <!-- Combat Records EXP -->
          <div class="metric-card card-exp" data-test="metric-exp">
            <span class="metric-tag">作战记录</span>
            <div class="metric-main">
              <span class="metric-num">{{ formatNumber(calculationReport.summary.exp) }}</span>
              <span class="metric-unit">EXP/日</span>
            </div>
            <span class="metric-sub">中级经验书等效</span>
          </div>

          <!-- Gold Manufacture -->
          <div class="metric-card card-gold" data-test="metric-gold">
            <span class="metric-tag">赤金制造</span>
            <div class="metric-main">
              <span class="metric-num">{{ formatNumber(calculationReport.summary.goldCount, 1) }}</span>
              <span class="metric-unit">条/日</span>
            </div>
            <span class="metric-sub">基础价值 {{ formatNumber(calculationReport.summary.goldValue) }} 龙门币</span>
          </div>

          <!-- Theoretical Drones -->
          <div class="metric-card card-drones" data-test="metric-drones">
            <span class="metric-tag">理论无人机</span>
            <div class="metric-main">
              <span class="metric-num">{{ formatNumber(calculationReport.drones, 1) }}</span>
              <span class="metric-unit">架/日</span>
            </div>
            <span class="metric-sub">长期日均充能</span>
          </div>

          <!-- Orundum & Fragments (if present) -->
          <div
            v-if="calculationReport.summary.orundum > 0 || calculationReport.summary.fragments > 0"
            class="metric-card card-orundum"
            data-test="metric-orundum"
          >
            <span class="metric-tag">合成玉产出</span>
            <div class="metric-main">
              <span class="metric-num">{{ formatNumber(calculationReport.summary.orundum) }}</span>
              <span class="metric-unit">玉/日</span>
            </div>
            <span class="metric-sub">源石碎片 {{ formatNumber(calculationReport.summary.fragments, 1) }} 个</span>
          </div>
        </div>
      </section>

      <!-- Exact Base Map Board (Horizontally scrollable without distortion) -->
      <section class="board-section" data-test="base-map-section">
        <div class="board-scroll-container">
          <BaseMap ref="baseMapRef" />
        </div>
      </section>

      <!-- Selected Facility Editor -->
      <section
        ref="facilityEditorSectionRef"
        class="facility-editor-section"
        data-test="facility-editor-section"
      >
        <FacilityEditor @request-picker="handleRequestPicker" />
      </section>

      <!-- Policy Editor -->
      <section
        ref="policyEditorSectionRef"
        class="policy-editor-section"
        data-test="policy-editor-section"
      >
        <PolicyEditor />
      </section>
    </main>

    <!-- Compact Attribution Footer -->
    <footer class="workbench-footer" data-test="workbench-footer">
      <div class="footer-attribution">
        <span>{{ EDITION.label }} · 组合规则引擎 v0.3.0</span>
        <span class="dot-sep">·</span>
        <span>Arknights Mower 排班兼容</span>
        <span class="dot-sep">·</span>
        <span>本地保存 · 不上传配置</span>
        <span class="dot-sep">·</span>
        <span>GameData {{ GAME_DATA_VERSION }} · {{ OPERATOR_PROFILE_COUNT }} 份基建档案</span>
      </div>
    </footer>

    <!-- Modals -->
    <OperatorSelectModal
      :open="pickerOpen"
      :mode="pickerMode"
      :room-id="pickerRoomId"
      :slot-index="pickerSlotIndex"
      @update:open="pickerOpen = $event"
      @close="pickerOpen = false"
      @selected="handlePickerSelected"
    />

    <GlobalReplaceModal
      :open="replaceModalOpen"
      @update:open="replaceModalOpen = $event"
      @close="replaceModalOpen = false"
      @replaced="handleGlobalReplaced"
    />
  </div>
</template>

<style scoped>
.workbench-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  width: 100%;
  background: #0d1117;
  color: #e9f2f4;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  box-sizing: border-box;
}

/* Topbar */
.workbench-topbar {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid rgba(173, 209, 216, 0.16);
  background: rgba(13, 17, 23, 0.94);
  backdrop-filter: blur(14px);
  position: sticky;
  top: 0;
  z-index: 30;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  color: #071015;
  background: #42d6c7;
  font: 800 22px/1 Consolas, monospace;
  clip-path: polygon(0 0, 78% 0, 100% 22%, 100% 100%, 22% 100%, 0 78%);
  flex-shrink: 0;
}

.eyebrow {
  margin: 0 0 2px;
  color: #42d6c7;
  letter-spacing: 0.15em;
  font: 600 10px/1.2 Consolas, monospace;
}

h1 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

h1 small {
  margin-left: 8px;
  padding: 2px 6px;
  color: #42d6c7;
  border: 1px solid rgba(66, 214, 199, 0.28);
  border-radius: 3px;
  font-size: 10px;
  vertical-align: middle;
}

.edition-description {
  margin: 2px 0 0;
  color: #8da5ac;
  font-size: 11px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.plan-name-input-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.plan-name-input-label span {
  font-size: 10px;
  color: #8da5ac;
}

.plan-name-input {
  width: 200px;
  height: 30px;
  padding: 0 10px;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #fff;
  outline: none;
  transition: border-color 0.2s;
}

.plan-name-input:focus {
  border-color: #42d6c7;
}

/* Toolbar sticky wrapper */
.toolbar-sticky-wrapper {
  width: 100%;
  background: #141920;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  z-index: 20;
}

.toolbar-scroll-container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  justify-content: center;
  padding: 4px 0;
  box-sizing: border-box;
}

/* Main Layout Area */
.workbench-main {
  flex: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 16px 48px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Replace status banner */
.replace-status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(32, 128, 240, 0.15);
  border: 1px solid rgba(32, 128, 240, 0.4);
  border-radius: 4px;
  color: #70c0e8;
  font-size: 13px;
  animation: fadeIn 0.2s ease-in-out;
}

.replace-status-icon {
  font-weight: bold;
}

.replace-status-text {
  flex: 1;
}

.replace-status-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  opacity: 0.7;
}

.replace-status-close:hover {
  opacity: 1;
}

/* Board Section: horizontal scroll container without board distortion */
.board-section {
  width: 100%;
}

.board-scroll-container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  justify-content: center;
  box-sizing: border-box;
}

@media (max-width: 1020px) {
  .board-scroll-container {
    justify-content: flex-start;
  }
}

/* Compact Results Panel */
.results-panel {
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: 14px 18px;
  background: #18181c;
  border-radius: 4px;
  border: 1px solid rgba(66, 214, 199, 0.3);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.results-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 8px;
}

.results-title-box {
  display: flex;
  flex-direction: column;
}

.results-kicker {
  color: #42d6c7;
  font-size: 10px;
  letter-spacing: 0.15em;
  font-family: Consolas, monospace;
}

.results-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.power-summary-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  background: rgba(24, 160, 88, 0.15);
  border: 1px solid rgba(24, 160, 88, 0.35);
  border-radius: 4px;
  padding: 3px 8px;
  color: #63e2b7;
}

.power-summary-badge.is-danger {
  background: rgba(208, 48, 80, 0.15);
  border-color: rgba(208, 48, 80, 0.4);
  color: #ff7875;
}

.power-margin-text {
  font-weight: 600;
}

.power-tag {
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.2);
}

.results-error-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(208, 48, 80, 0.15);
  border: 1px solid rgba(208, 48, 80, 0.4);
  border-radius: 4px;
  color: #ff7875;
  font-size: 13px;
}

.results-blocked-box {
  padding: 10px 14px;
  background: rgba(240, 160, 32, 0.12);
  border: 1px solid rgba(240, 160, 32, 0.35);
  border-radius: 4px;
  color: #f2c97d;
  font-size: 13px;
}

.blocked-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.blocked-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.metric-card {
  padding: 10px 14px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-lmd {
  border-left: 3px solid #2080f0;
}

.card-exp {
  border-left: 3px solid #f0a020;
}

.card-gold {
  border-left: 3px solid #f0bd5b;
}

.card-drones {
  border-left: 3px solid #42d6c7;
}

.card-orundum {
  border-left: 3px solid #d03050;
}

.metric-tag {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
}

.metric-main {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.metric-num {
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
}

.metric-unit {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.metric-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

/* Compact Attribution Footer */
.workbench-footer {
  padding: 24px 16px;
  margin-top: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 17, 23, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
}

.footer-attribution {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #8da5ac;
}

.dot-sep {
  opacity: 0.4;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
