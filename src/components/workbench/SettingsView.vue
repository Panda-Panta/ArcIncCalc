<script setup lang="ts">
import { computed } from 'vue'
import OperatorInventoryPanel from './OperatorInventoryPanel.vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import { getRoomDisplayName } from '../../workbench/operatorHelpers'
import type { OwnedOperatorInput } from '../../domain/operatorInventory'

export interface SimulationSettings {
  sampleDays: number
  warmupDays: number
  step: number
  seed: number
  droneTarget: 'gold' | 'exp' | 'trading' | 'none'
  droneTradingRoomId?: string
  fiammettaFool?: boolean
  restingThreshold?: number
}

const props = defineProps<{
  settings: SimulationSettings
}>()

const emit = defineEmits<{
  (e: 'update:settings', val: SimulationSettings): void
  (e: 'inventory-change', val: { enabled: boolean; valid: boolean; entries: OwnedOperatorInput[] }): void
}>()

const store = useRosterWorkbenchStore()

const tradingRooms = computed(() => {
  const facilities = store.workspace.mainPlan.facilities
  return Object.values(facilities)
    .filter(f => f.type === 'trading')
    .map(f => ({
      id: f.roomId,
      label: getRoomDisplayName(f.roomId, 'trading'),
    }))
})

function updateField<K extends keyof SimulationSettings>(key: K, val: SimulationSettings[K]): void {
  emit('update:settings', {
    ...props.settings,
    [key]: val,
  })
}
</script>

<template>
  <div class="settings-view plan-container" data-test="settings-view">
    <!-- Section 1: 动态模拟运行设置 -->
    <section class="settings-card" data-test="sim-settings-card">
      <div class="card-header">
        <h3 class="card-title">动态模拟运行设置</h3>
        <span class="card-subtitle">控制点击「计算产出」时执行的动态多周期微积分模拟参数</span>
      </div>

      <div class="sim-controls-grid">
        <label class="control-item">
          <span class="control-label">菲亚防呆</span>
          <select class="control-select" data-test="fiammetta-fool" :value="String(settings.fiammettaFool ?? true)" @change="updateField('fiammettaFool', ($event.target as HTMLSelectElement).value === 'true')">
            <option value="true">开启（Mower 默认）</option>
            <option value="false">关闭（允许最低心情候选兜底）</option>
          </select>
          <span class="control-hint">按作业要求设置；排班图片不包含这个全局选项。</span>
        </label>
        <label class="control-item">
          <span class="control-label">休息阈值（%）</span>
          <input class="control-input" data-test="resting-threshold" type="number" min="0" max="100" step="1" :value="(settings.restingThreshold ?? .65) * 100" @input="updateField('restingThreshold', Number(($event.target as HTMLInputElement).value) / 100)" />
        </label>
        <!-- 采样天数 -->
        <label class="control-item">
          <span class="control-label">采样天数（天）</span>
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            class="control-input"
            :value="settings.sampleDays"
            @input="updateField('sampleDays', Number(($event.target as HTMLInputElement).value))"
          />
        </label>

        <!-- 预热天数 -->
        <label class="control-item">
          <span class="control-label">预热天数（天）</span>
          <input
            type="number"
            min="0"
            max="30"
            step="1"
            class="control-input"
            :value="settings.warmupDays"
            @input="updateField('warmupDays', Number(($event.target as HTMLInputElement).value))"
          />
        </label>

        <!-- 最大步长 -->
        <label class="control-item">
          <span class="control-label">计算步长</span>
          <select
            class="control-select"
            :value="settings.step"
            @change="updateField('step', Number(($event.target as HTMLSelectElement).value))"
          >
            <option :value="0.25">15 分钟（推荐，平滑平衡）</option>
            <option :value="0.05">3 分钟（高精度）</option>
            <option :value="0.01">36 秒（极高精度）</option>
          </select>
        </label>

        <!-- 随机种子 -->
        <label class="control-item">
          <span class="control-label">随机种子 (Seed)</span>
          <input
            type="number"
            min="-1"
            max="4294967295"
            step="1"
            class="control-input"
            :value="settings.seed"
            placeholder="-1 (随机)"
            @input="updateField('seed', Number(($event.target as HTMLInputElement).value))"
          />
          <span class="control-hint">-1 代表随机种子</span>
        </label>

        <!-- 余量无人机加速目标 -->
        <label class="control-item">
          <span class="control-label">余量无人机加速</span>
          <select
            class="control-select"
            :value="settings.droneTarget"
            @change="updateField('droneTarget', ($event.target as HTMLSelectElement).value as any)"
          >
            <option value="gold">加速赤金制造</option>
            <option value="exp">加速作战记录制造</option>
            <option value="trading">加速贸易站</option>
            <option value="none">不使用无人机加速</option>
          </select>
        </label>

        <!-- 目标贸易站 (仅在选择加速贸易站时显示) -->
        <label v-if="settings.droneTarget === 'trading'" class="control-item">
          <span class="control-label">目标加速贸易站</span>
          <select
            class="control-select highlight-select"
            :value="settings.droneTradingRoomId || (tradingRooms[0]?.id ?? '')"
            @change="updateField('droneTradingRoomId', ($event.target as HTMLSelectElement).value)"
          >
            <option v-if="tradingRooms.length === 0" value="">当前无贸易站设施</option>
            <option v-for="r in tradingRooms" :key="r.id" :value="r.id">
              {{ r.label }}
            </option>
          </select>
        </label>
      </div>

      <div class="locked-rules-bar">
        <span class="locked-tag">锁定规则</span>
        <span>暖机增长: <strong>整小时跳变</strong></span>
        <span class="dot">·</span>
        <span>跑单方式: <strong>理想跑单（无损耗）</strong></span>
        <span class="dot">·</span>
        <span>产出口径: <strong>直观产出（忽略库存阻塞）</strong></span>
      </div>
    </section>

    <!-- Section 2: 干员库 -->
    <section class="settings-card" data-test="inventory-settings-card">
      <OperatorInventoryPanel @change="emit('inventory-change', $event)" />
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.settings-card {
  padding: 16px 20px;
  background: #18181c;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
}

.card-header {
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 8px;
}

.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #ffffff;
}

.card-subtitle {
  font-size: 12px;
  color: #8da5ac;
}

.sim-controls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}

.control-hint {
  font-size: 11px;
  color: #8da5ac;
}

.control-input,
.control-select {
  height: 32px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #ffffff;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.control-input:focus,
.control-select:focus {
  border-color: #42d6c7;
}

.highlight-select {
  border-color: rgba(66, 214, 199, 0.5);
  background: rgba(66, 214, 199, 0.08);
}

.locked-rules-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
  font-size: 12px;
  color: #8da5ac;
}

.locked-tag {
  background: rgba(66, 214, 199, 0.15);
  color: #42d6c7;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

.dot {
  opacity: 0.4;
}
</style>
