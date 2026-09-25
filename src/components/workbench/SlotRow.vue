<template>
  <tr class="mower-slot-row">
    <td class="select-label">
      {{ rowLabel }}
    </td>
    <td class="table-space">
      <div class="operator-cell operator-select">
        <n-select
          :value="occupantSelectValue"
          :options="occupantOptions"
          class="occupant-select"
          size="small"
          @update:value="onOccupantKindChange"
        />
        <n-button
          size="small"
          class="operator-pick-btn"
          :type="slot.occupant.kind === 'operator' ? 'primary' : 'default'"
          ghost
          @click="onPickMain"
        >
          <img v-if="slot.occupant.kind === 'operator' && !avatarFailed" :src="getOperatorAvatarUrl(operatorButtonText)" :alt="operatorButtonText" class="main-operator-avatar" @error="avatarFailed = true" />
          <span>{{ operatorButtonText }}</span>
        </n-button>
      </div>
    </td>
    <td class="select-label">
      <span>组</span>
    </td>
    <td class="table-space group">
      <n-input
        :value="slot.groupId ?? ''"
        class="group-input"
        size="small"
        placeholder="组名"
        :disabled="isEmpty"
        @update:value="onGroupChange"
      />
    </td>
    <td class="select-label">
      <span>替换：</span>
    </td>
    <td>
      <ReplacementList
        class="replacement-select"
        :room-id="roomId"
        :slot-index="slotIndex"
        :replacements="slot.replacements"
        :disabled="isEmpty"
        @pick="onPickReplacement"
      />
    </td>
  </tr>
</template>

<script setup lang="ts">
/**
 * Derivative work based on arknights-mower (PlanEditor.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { computed, ref, watch } from 'vue'
import { NButton, NInput, NSelect } from 'naive-ui'
import ReplacementList from './ReplacementList.vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import { getOperatorAvatarUrl } from '../../workbench/operatorHelpers'
import { OPERATOR_MAP } from '../../domain/operators'
import type { MowerRoomId, MowerSlot } from '../../workbench/model'

interface Props {
  roomId: MowerRoomId
  slotIndex: number
  slot: MowerSlot
}

const props = defineProps<Props>()
const avatarFailed = ref(false)
watch(() => props.slot.occupant, () => { avatarFailed.value = false }, { deep: true })

const emit = defineEmits<{
  (
    e: 'request-picker',
    payload: { roomId: MowerRoomId; slotIndex: number; mode: 'main' | 'replacement' },
  ): void
}>()

const store = useRosterWorkbenchStore()

const isEmpty = computed<boolean>(() => props.slot.occupant.kind === 'empty')

const rowLabel = computed<string>(() => {
  if (props.roomId === 'train') {
    if (props.slotIndex === 0) return '协助位'
    if (props.slotIndex === 1) return '训练位'
  }
  return '干员：'
})

const occupantSelectValue = computed<string>(() => {
  return props.slot.occupant.kind
})

const occupantOptions = computed(() => {
  const currentKind = props.slot.occupant.kind
  const opLabel =
    currentKind === 'operator'
      ? (OPERATOR_MAP.get(props.slot.occupant.operatorId)?.name ?? props.slot.occupant.operatorId)
      : '干员'

  return [
    { label: '（无）', value: 'empty' },
    { label: 'Free', value: 'free' },
    { label: 'Current', value: 'current' },
    { label: opLabel, value: 'operator' },
  ]
})

const operatorButtonText = computed<string>(() => {
  if (props.slot.occupant.kind === 'operator') {
    const op = OPERATOR_MAP.get(props.slot.occupant.operatorId)
    return op ? op.name : props.slot.occupant.operatorId
  }
  if (props.slot.occupant.kind === 'free') return 'Free'
  if (props.slot.occupant.kind === 'current') return 'Current'
  return '选择干员'
})

function onOccupantKindChange(value: string): void {
  if (value === 'empty') {
    store.updateSlotOccupant(props.roomId, props.slotIndex, { kind: 'empty' })
  } else if (value === 'free') {
    store.updateSlotOccupant(props.roomId, props.slotIndex, { kind: 'free' })
  } else if (value === 'current') {
    store.updateSlotOccupant(props.roomId, props.slotIndex, { kind: 'current' })
  } else if (value === 'operator') {
    if (props.slot.occupant.kind !== 'operator') {
      emit('request-picker', { roomId: props.roomId, slotIndex: props.slotIndex, mode: 'main' })
    }
  }
}

function onGroupChange(val: string): void {
  store.updateSlotGroup(props.roomId, props.slotIndex, val ? val : null)
}

function onPickMain(): void {
  emit('request-picker', { roomId: props.roomId, slotIndex: props.slotIndex, mode: 'main' })
}

function onPickReplacement(): void {
  emit('request-picker', { roomId: props.roomId, slotIndex: props.slotIndex, mode: 'replacement' })
}
</script>

<style scoped>
.main-operator-avatar { width: 32px; height: 32px; object-fit: cover; border-radius: 4px; margin-right: 6px; }
.operator-pick-btn:has(.main-operator-avatar) { height: 40px; }
</style>
