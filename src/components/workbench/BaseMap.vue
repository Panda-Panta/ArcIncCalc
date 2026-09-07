<template>
  <div class="mower-base-map plan-scroll-wrapper">
    <div class="plan-container" ref="outer">
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
</template>

<script setup lang="ts">
/**
 * Derivative work based on arknights-mower (PlanEditor.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { ref } from 'vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import {
  type MowerOutputRoomId,
  type MowerRoomId,
} from '../../workbench/model'
import FacilityCard from './FacilityCard.vue'
import '../../workbench/styles.css'

const store = useRosterWorkbenchStore()
const outer = ref<HTMLDivElement | null>(null)

const rightFacilities: readonly MowerRoomId[] = ['meeting', 'factory', 'contact', 'train']

function handleSelect(roomId: MowerRoomId) {
  store.selectRoom(roomId)
}

function handleSwap(fromId: MowerOutputRoomId, toId: MowerOutputRoomId) {
  store.swapOutputRooms(fromId, toId)
}

defineExpose({
  outer,
})
</script>