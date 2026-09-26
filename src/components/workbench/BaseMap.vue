<template>
  <div class="mower-base-map plan-scroll-wrapper" ref="wrapperRef">
    <!-- Responsive Viewport Toolbar when narrow / mobile -->
    <div v-if="isNarrowViewport" class="base-map-zoom-bar" data-test="base-map-zoom-bar">
      <span class="zoom-title">视图缩放:</span>
      <button
        type="button"
        class="zoom-btn"
        :class="{ active: zoomMode === 'fit' }"
        data-test="zoom-fit-btn"
        @click="zoomMode = 'fit'"
      >
        📱 宽度自适应 ({{ Math.round(computedScale * 100) }}%)
      </button>
      <button
        type="button"
        class="zoom-btn"
        :class="{ active: zoomMode === '100' }"
        data-test="zoom-100-btn"
        @click="zoomMode = '100'"
      >
        ↔️ 原始尺寸 (100%)
      </button>
    </div>

    <div class="plan-scale-wrapper" :style="scaleWrapperStyle">
      <div class="plan-container" ref="outer" :style="planContainerStyle">
        <div class="outer">
          <!-- Left: 3 rows x 3 cols output rooms (9 rooms) -->
          <div class="left_box">
            <div class="left_contain" v-for="row in 3" :key="row">
              <FacilityCard
                v-for="col in 3"
                :key="`room_${row}_${col}`"
                :facility="store.workspace.mainPlan.facilities[`room_${row}_${col}` as MowerOutputRoomId]"
                :is-selected="store.selectedRoomId === `room_${row}_${col}`"
                variant="output"
                @select="handleSelect"
                @swap="handleSwap"
              />
            </div>
          </div>

          <!-- Center: central + 4 dorms (5 rooms) -->
          <div class="mid_box">
            <div class="mid_contain">
              <FacilityCard
                :facility="store.workspace.mainPlan.facilities.central"
                :is-selected="store.selectedRoomId === 'central'"
                variant="center"
                @select="handleSelect"
              />
            </div>
            <div class="mid_contain" v-for="i in 4" :key="`dormitory_${i}`">
              <FacilityCard
                :facility="store.workspace.mainPlan.facilities[`dormitory_${i}` as MowerRoomId]"
                :is-selected="store.selectedRoomId === `dormitory_${i}`"
                variant="center"
                @select="handleSelect"
              />
            </div>
          </div>

          <!-- Right: meeting, factory, contact, train (4 rooms) -->
          <div class="right_box">
            <div class="right_contain" v-for="id in rightFacilities" :key="id">
              <FacilityCard
                :facility="store.workspace.mainPlan.facilities[id]"
                :is-selected="store.selectedRoomId === id"
                variant="support"
                @select="handleSelect"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Derivative work based on arknights-mower (PlanEditor.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import {
  type MowerOutputRoomId,
  type MowerRoomId,
} from '../../workbench/model'
import FacilityCard from './FacilityCard.vue'
import '../../workbench/styles.css'

const store = useRosterWorkbenchStore()
const wrapperRef = ref<HTMLDivElement | null>(null)
const outer = ref<HTMLDivElement | null>(null)
const zoomMode = ref<'fit' | '100'>('100')
const containerWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 980)

const isNarrowViewport = computed(() => {
  return containerWidth.value < 980
})

const computedScale = computed(() => {
  if (zoomMode.value === '100' || containerWidth.value >= 980) {
    return 1
  }
  const availableWidth = Math.max(300, containerWidth.value - 24)
  return Math.min(1, Math.max(0.25, availableWidth / 980))
})

const scaleWrapperStyle = computed(() => {
  if (computedScale.value >= 1) return {}
  const baseHeight = outer.value?.offsetHeight || 420
  return {
    width: `${980 * computedScale.value}px`,
    height: `${baseHeight * computedScale.value}px`,
    overflow: 'hidden',
    margin: '0 auto',
    transition: 'all 0.2s ease',
  }
})

const planContainerStyle = computed(() => {
  if (computedScale.value >= 1) return {}
  return {
    transform: `scale(${computedScale.value})`,
    transformOrigin: 'top left',
    transition: 'transform 0.2s ease',
  }
})

function updateWidth() {
  if (typeof window !== 'undefined') {
    containerWidth.value = wrapperRef.value?.parentElement?.clientWidth || window.innerWidth
  }
}

onMounted(() => {
  updateWidth()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateWidth)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateWidth)
  }
})

const rightFacilities: readonly MowerRoomId[] = ['meeting', 'factory', 'contact', 'train']

function handleSelect(roomId: MowerRoomId) {
  store.selectRoom(roomId)
}

function handleSwap(fromId: MowerOutputRoomId, toId: MowerOutputRoomId) {
  store.swapOutputRooms(fromId, toId)
}

defineExpose({
  outer,
  zoomMode,
  computedScale,
})
</script>

<style scoped>
.base-map-zoom-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 6px 12px;
  background: rgba(20, 25, 32, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}
.zoom-title {
  font-weight: 500;
  color: #94a3b8;
}
.zoom-btn {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
.zoom-btn.active {
  background: #3b82f6;
  border-color: #60a5fa;
  color: #fff;
  font-weight: 600;
}
.plan-scale-wrapper {
  display: flex;
  justify-content: center;
}
</style>