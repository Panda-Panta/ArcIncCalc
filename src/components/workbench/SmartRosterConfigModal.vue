<template>
  <n-modal
    :show="isOpen"
    :to="to"
    preset="card"
    class="mower-smart-roster-modal"
    title="一键智能排班参数配置"
    :style="{ width: '620px', maxWidth: '95vw' }"
    :closable="true"
    :mask-closable="true"
    @update:show="onModalUpdateShow"
    @close="handleCancel"
  >
    <div class="roster-modal-body" data-test="smart-roster-modal-body">
      <div class="modal-intro">
        <p class="intro-title">⚡ 智能排班多阶段流程参数</p>
        <p class="intro-desc">
          系统将结合您持有的干员库，保留当前建筑与已配置在岗人员，通过三阶段算法自动组队与动态仿真寻优。您可以在此调整各阶段的计算深度与采样规模。
        </p>
      </div>

      <!-- Phase 1: Static Layout Exploration -->
      <fieldset class="config-fieldset">
        <legend class="fieldset-legend">
          <span class="phase-badge phase-1">阶段 1</span> 主班组合与跨站初筛
        </legend>
        <div class="field-row">
          <div class="field-item">
            <label for="trials-input">
              <span>候选尝试轮数 (Trials)</span>
              <small class="field-tip">独立随机抽样主班方案数 (1–10)</small>
            </label>
            <input
              id="trials-input"
              v-model.number="form.trials"
              type="number"
              min="1"
              max="10"
              class="mower-num-input"
              data-test="trials-input"
            />
          </div>
          <div class="field-item">
            <label for="max-evals-input">
              <span>单轮评估上限 (Evaluations)</span>
              <small class="field-tip">每轮搜索最大访问状态 (500–10000)</small>
            </label>
            <input
              id="max-evals-input"
              v-model.number="form.maxStaticEvals"
              type="number"
              min="500"
              max="10000"
              step="500"
              class="mower-num-input"
              data-test="max-evals-input"
            />
          </div>
        </div>
      </fieldset>

      <!-- Phase 2: Dynamic Simulation Verification -->
      <fieldset class="config-fieldset">
        <legend class="fieldset-legend">
          <span class="phase-badge phase-2">阶段 2</span> 全动态心情与产出仿真
        </legend>
        <div class="field-row">
          <div class="field-item">
            <label for="topk-input">
              <span>仿真验证方案数 (Top-K)</span>
              <small class="field-tip">进入多日高精度仿真的优质候选数 (1–16)</small>
            </label>
            <input
              id="topk-input"
              v-model.number="form.simulationTopK"
              type="number"
              min="1"
              max="16"
              class="mower-num-input"
              data-test="topk-input"
            />
          </div>
          <div class="field-item">
            <label for="sample-hours-input">
              <span>仿真采样时长 (小时)</span>
              <small class="field-tip">用于计算日均基建产出的采样时长 (24–168)</small>
            </label>
            <input
              id="sample-hours-input"
              v-model.number="form.simulationSampleHours"
              type="number"
              min="24"
              max="168"
              step="24"
              class="mower-num-input"
              data-test="sample-hours-input"
            />
          </div>
        </div>
      </fieldset>

      <!-- Phase 3: Neighborhood Deep Search -->
      <fieldset class="config-fieldset">
        <legend class="fieldset-legend">
          <span class="phase-badge phase-3">阶段 3</span> 邻域深度微调
        </legend>
        <div class="checkbox-row">
          <label class="checkbox-label" for="enable-deep-search">
            <input
              id="enable-deep-search"
              v-model="form.enableDeepSearch"
              type="checkbox"
              class="mower-checkbox"
              data-test="enable-deep-search"
            />
            <span class="checkbox-text">
              <strong>启用第三阶段深度微调搜索</strong>
              <small class="checkbox-hint">对仿真最优方案的替补与单工位进行局部遍历改进（推荐开启）</small>
            </span>
          </label>
        </div>
      </fieldset>

      <!-- Common Settings: Drone & Seed -->
      <fieldset class="config-fieldset">
        <legend class="fieldset-legend">
          <span class="phase-badge phase-common">偏好</span> 辅助控制与种子
        </legend>
        <div class="field-row">
          <div class="field-item">
            <label for="drone-target-select">
              <span>无人机加速倾向</span>
              <small class="field-tip">仿真与微调中的无人机默认消耗方向</small>
            </label>
            <select
              id="drone-target-select"
              v-model="form.droneTarget"
              class="mower-select-input"
              data-test="drone-target-select"
            >
              <option value="gold">制造站：赤金加速</option>
              <option value="exp">制造站：中级作战记录加速</option>
              <option value="trading">贸易站：订单获取加速</option>
              <option value="none">不使用无人机加速</option>
            </select>
          </div>
          <div class="field-item">
            <label for="seed-input">
              <span>随机种子 (Seed)</span>
              <small class="field-tip">-1 代表随机种子，输入数值可复现</small>
            </label>
            <input
              id="seed-input"
              v-model.number="form.seed"
              type="number"
              min="-1"
              class="mower-num-input"
              data-test="seed-input"
              placeholder="-1"
            />
          </div>
        </div>
      </fieldset>
    </div>

    <!-- Footer Action Buttons -->
    <template #footer>
      <div class="modal-footer">
        <n-button
          class="btn-reset"
          data-test="reset-btn"
          size="small"
          @click="handleReset"
        >
          ↺ 恢复默认
        </n-button>
        <div class="footer-right">
          <n-button
            class="btn-cancel"
            data-test="cancel-btn"
            size="small"
            @click="handleCancel"
          >
            取消
          </n-button>
          <n-button
            class="btn-confirm"
            data-test="confirm-btn"
            type="primary"
            size="small"
            @click="handleConfirm"
          >
            🚀 开始智能排班
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script lang="ts">
export interface SmartRosterConfig {
  trials: number
  maxStaticEvals: number
  simulationTopK: number
  simulationSampleHours: number
  simulationWarmupHours: number
  enableDeepSearch: boolean
  droneTarget: 'gold' | 'exp' | 'trading' | 'none'
  seed: number
}

export const STORAGE_KEY_SMART_ROSTER = 'arcinc-smart-roster-options-v1'

export const DEFAULT_CONFIG: SmartRosterConfig = {
  trials: 5,
  maxStaticEvals: 3000,
  simulationTopK: 8,
  simulationSampleHours: 72,
  simulationWarmupHours: 24,
  enableDeepSearch: true,
  droneTarget: 'gold',
  seed: -1,
}
</script>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'

const props = withDefaults(
  defineProps<{
    open?: boolean
    visible?: boolean
    to?: string | HTMLElement | undefined
    initialDroneTarget?: 'gold' | 'exp' | 'trading' | 'none'
    initialSeed?: number
  }>(),
  {
    open: undefined,
    visible: undefined,
    to: undefined,
    initialDroneTarget: 'gold',
    initialSeed: -1,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', config: SmartRosterConfig): void
}>()

const isOpen = ref(false)

const loadPersistedConfig = (): SmartRosterConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SMART_ROSTER)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        trials: Math.max(1, Math.min(10, Number(parsed.trials) || DEFAULT_CONFIG.trials)),
        maxStaticEvals: Math.max(500, Math.min(10000, Number(parsed.maxStaticEvals) || DEFAULT_CONFIG.maxStaticEvals)),
        simulationTopK: Math.max(1, Math.min(16, Number(parsed.simulationTopK) || DEFAULT_CONFIG.simulationTopK)),
        simulationSampleHours: Math.max(24, Math.min(168, Number(parsed.simulationSampleHours) || DEFAULT_CONFIG.simulationSampleHours)),
        simulationWarmupHours: Math.max(6, Math.min(48, Number(parsed.simulationWarmupHours) || DEFAULT_CONFIG.simulationWarmupHours)),
        enableDeepSearch: parsed.enableDeepSearch !== undefined ? Boolean(parsed.enableDeepSearch) : DEFAULT_CONFIG.enableDeepSearch,
        droneTarget: ['gold', 'exp', 'trading', 'none'].includes(parsed.droneTarget) ? parsed.droneTarget : props.initialDroneTarget,
        seed: Number.isInteger(parsed.seed) ? parsed.seed : props.initialSeed,
      }
    }
  } catch {
    // Ignore storage parse failure
  }
  return {
    ...DEFAULT_CONFIG,
    droneTarget: props.initialDroneTarget,
    seed: props.initialSeed,
  }
}

const form = ref<SmartRosterConfig>(loadPersistedConfig())

watch(
  () => props.open ?? props.visible ?? false,
  (val) => {
    isOpen.value = val
    if (val) {
      form.value = loadPersistedConfig()
    }
  },
  { immediate: true },
)

const onModalUpdateShow = (show: boolean) => {
  isOpen.value = show
  if (!show) {
    emit('close')
  }
}

const handleCancel = () => {
  isOpen.value = false
  emit('close')
}

const handleReset = () => {
  form.value = {
    ...DEFAULT_CONFIG,
    droneTarget: props.initialDroneTarget,
    seed: props.initialSeed,
  }
  try {
    localStorage.removeItem(STORAGE_KEY_SMART_ROSTER)
  } catch {
    // ignore
  }
}

const handleConfirm = () => {
  // Sanitize numeric ranges
  const config: SmartRosterConfig = {
    trials: Math.max(1, Math.min(10, Math.floor(form.value.trials) || 1)),
    maxStaticEvals: Math.max(500, Math.min(10000, Math.floor(form.value.maxStaticEvals) || 500)),
    simulationTopK: Math.max(1, Math.min(16, Math.floor(form.value.simulationTopK) || 1)),
    simulationSampleHours: Math.max(24, Math.min(168, Math.floor(form.value.simulationSampleHours) || 24)),
    simulationWarmupHours: Math.max(6, Math.min(48, Math.floor(form.value.simulationWarmupHours) || 6)),
    enableDeepSearch: Boolean(form.value.enableDeepSearch),
    droneTarget: form.value.droneTarget,
    seed: Number.isInteger(form.value.seed) ? form.value.seed : -1,
  }

  try {
    localStorage.setItem(STORAGE_KEY_SMART_ROSTER, JSON.stringify(config))
  } catch {
    // ignore storage quota error
  }

  isOpen.value = false
  emit('confirm', config)
}
</script>

<style scoped>
.mower-smart-roster-modal {
  font-family: inherit;
}

.roster-modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #e2e8f0;
}

.modal-intro {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(66, 214, 199, 0.25);
  border-radius: 8px;
  padding: 10px 14px;
}

.intro-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: #42d6c7;
}

.intro-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #94a3b8;
}

.config-fieldset {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 12px 14px 14px;
  margin: 0;
  background: rgba(0, 0, 0, 0.22);
}

.fieldset-legend {
  font-size: 12px;
  font-weight: 700;
  color: #f1f5f9;
  padding: 0 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.phase-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-weight: 800;
}

.phase-1 {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.4);
}

.phase-2 {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.phase-3 {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.4);
}

.phase-common {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 4px;
}

@media (max-width: 500px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-item label {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
  display: flex;
  flex-direction: column;
}

.field-tip {
  font-size: 11px;
  color: #64748b;
  font-weight: normal;
  margin-top: 1px;
}

.mower-num-input,
.mower-select-input {
  background: #101921;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 6px 10px;
  color: #e9f2f4;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.mower-num-input:focus,
.mower-select-input:focus {
  border-color: #42d6c7;
  box-shadow: 0 0 0 2px rgba(66, 214, 199, 0.2);
}

.checkbox-row {
  display: flex;
  align-items: center;
  margin-top: 4px;
}

.checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.mower-checkbox {
  margin-top: 3px;
  accent-color: #a855f7;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.checkbox-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  color: #e2e8f0;
}

.checkbox-hint {
  font-size: 11px;
  color: #94a3b8;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.footer-right {
  display: flex;
  gap: 8px;
}

.btn-confirm {
  background: #18a058 !important;
  border-color: #18a058 !important;
  color: #ffffff !important;
  font-weight: 700;
}
</style>
