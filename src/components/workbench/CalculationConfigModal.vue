<script lang="ts">
export interface CalculationConfig {
  droneTarget: 'gold' | 'exp' | 'trading' | 'none'
  droneTradingRoomId: string
}
</script>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'
import type { RosterWorkspace } from '../../workbench/model'

const props = defineProps<{ open: boolean; workspace: RosterWorkspace; initial: CalculationConfig }>()
const emit = defineEmits<{ close: []; confirm: [config: CalculationConfig] }>()
const target = ref<CalculationConfig['droneTarget']>('gold')
const room = ref('')
const tradingRooms = computed(() => Object.values(props.workspace.mainPlan.facilities).filter(f => f.type === 'trading'))
watch(() => props.open, open => {
  if (!open) return
  target.value = props.initial.droneTarget
  room.value = tradingRooms.value.some(f => f.roomId === props.initial.droneTradingRoomId) ? props.initial.droneTradingRoomId : ''
}, { immediate: true })
</script>

<template>
  <NModal :show="open" preset="card" title="计算产出" :style="{ width: '520px', maxWidth: '95vw' }" @update:show="!$event && emit('close')">
    <div class="calculation-config" data-test="calculation-config">
      <p>选择本次模拟的无人机加速目标。计算将在后台进行，可随时中止。</p>
      <label>无人机加速目标
        <select v-model="target" data-test="calculation-drone-target">
          <option value="gold">制造站：赤金加速</option>
          <option value="exp">制造站：作战记录加速</option>
          <option value="trading" :disabled="!tradingRooms.length">贸易站：订单获取加速</option>
          <option value="none">不使用无人机加速</option>
        </select>
      </label>
      <label v-if="target === 'trading'">加速贸易站
        <select v-model="room" data-test="calculation-trading-room">
          <option value="">自动选择贸易站</option>
          <option v-for="facility in tradingRooms" :key="facility.roomId" :value="facility.roomId">{{ facility.roomId.replace('room_', '').replace('_', '-') }} 贸易站</option>
        </select>
      </label>
    </div>
    <template #footer>
      <div class="calculation-actions">
        <NButton @click="emit('close')">取消</NButton>
        <NButton type="primary" data-test="confirm-calculation" :disabled="target === 'trading' && !tradingRooms.length" @click="emit('confirm', { droneTarget: target, droneTradingRoomId: target === 'trading' ? room : '' })">开始计算</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.calculation-config { display: flex; flex-direction: column; gap: 18px; }
.calculation-config p { margin: 0; color: #a9b5c8; line-height: 1.7; }
.calculation-config label { display: flex; flex-direction: column; gap: 8px; }
.calculation-config select { width: 100%; padding: 10px 12px; background: #18212f; color: #e2e8f0; border: 1px solid #455367; border-radius: 6px; }
.calculation-actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
