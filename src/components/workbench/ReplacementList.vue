<template>
  <div class="mower-replacement-list" :class="{ 'is-disabled': disabled }">
    <div class="replacement-items">
      <div
        v-for="(opId, idx) in replacements"
        :key="`${opId}-${idx}`"
        class="replacement-item"
        :draggable="!disabled"
        @dragstart="onDragStart($event, idx)"
        @dragover="onDragOver"
        @drop="onDrop($event, idx)"
      >
        <div class="replacement-avatar-wrapper">
          <img
            v-if="!imageErrors[`${opId}-${idx}`]"
            :src="getAvatarSrc(opId)"
            :alt="getOpName(opId)"
            width="45"
            height="45"
            class="replacement-avatar"
            draggable="false"
            @error="imageErrors[`${opId}-${idx}`] = true"
          />
          <div
            v-else
            class="replacement-fallback avatar-fallback"
            :title="getOpName(opId)"
          >
            {{ getOpName(opId) }}
          </div>
          <button
            v-if="!disabled"
            type="button"
            class="remove-btn"
            title="删除"
            aria-label="删除"
            @click.stop="onRemove(idx)"
          >
            ×
          </button>
        </div>
      </div>
    </div>
    <n-button
      size="small"
      ghost
      type="primary"
      class="add-replacement-btn"
      :disabled="disabled"
      @click="onAdd"
    >
      添加替换
    </n-button>
  </div>
</template>

<script setup lang="ts">
/**
 * Derivative work based on arknights-mower (PlanEditor.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { ref } from 'vue'
import { NButton } from 'naive-ui'
import { useRosterWorkbenchStore } from '../../workbench/store'
import { getOperatorAvatarUrl } from '../../workbench/operatorHelpers'
import { OPERATOR_MAP } from '../../domain/operators'
import type { MowerRoomId } from '../../workbench/model'

interface Props {
  roomId: MowerRoomId
  slotIndex: number
  replacements: string[]
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  (e: 'pick'): void
}>()

const store = useRosterWorkbenchStore()
const imageErrors = ref<Record<string, boolean>>({})

function getOpName(identifier: string): string {
  if (!identifier) return ''
  const op = OPERATOR_MAP.get(identifier)
  return op ? op.name : identifier
}

function getAvatarSrc(identifier: string): string {
  return getOperatorAvatarUrl(identifier)
}

function onDragStart(event: DragEvent, index: number): void {
  if (props.disabled) return
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', String(index))
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(event: DragEvent): void {
  if (!props.disabled) {
    event.preventDefault()
  }
}

function onDrop(event: DragEvent, toIndex: number): void {
  if (props.disabled) return
  event.preventDefault()
  if (!event.dataTransfer) return
  const rawFrom = event.dataTransfer.getData('text/plain')
  const fromIndex = parseInt(rawFrom, 10)
  if (Number.isNaN(fromIndex) || fromIndex === toIndex) return
  store.reorderReplacements(props.roomId, props.slotIndex, fromIndex, toIndex)
}

function onRemove(index: number): void {
  if (props.disabled) return
  store.removeReplacement(props.roomId, props.slotIndex, index)
}

function onAdd(): void {
  if (props.disabled) return
  emit('pick')
}
</script>
