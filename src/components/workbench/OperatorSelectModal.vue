<template>
  <n-modal
    :show="open"
    :to="to"
    preset="card"
    class="mower-operator-modal"
    :title="modalTitle"
    :style="{ width: '680px', maxWidth: '95vw' }"
    :closable="true"
    :mask-closable="true"
    @update:show="onModalUpdateShow"
    @close="onClose"
  >
    <!-- Search Row -->
    <div class="modal-search-row">
      <n-input
        v-model:value="searchQuery"
        placeholder="搜索干员（中文 / 拼音全拼 / 首字母 / 英文代号）"
        clearable
        size="small"
        class="search-input"
        autofocus
      />
    </div>

    <!-- Special values section (Main mode only) -->
    <div v-if="mode === 'main'" class="special-values-section">
      <div class="section-label">特殊槽位状态：</div>
      <div class="special-buttons">
        <button
          type="button"
          class="special-btn special-empty"
          title="清空当前槽位干员"
          @click="selectSpecial('empty')"
        >
          <span class="special-icon">∅</span>
          <span class="special-title">（无）/ 清空</span>
        </button>
        <button
          type="button"
          class="special-btn special-free"
          title="标记为 Free（自由进出/休息）"
          @click="selectSpecial('free')"
        >
          <img
            :src="getOperatorAvatarUrl('Free')"
            alt="Free"
            width="24"
            height="24"
            class="special-avatar"
            @error="(e) => ((e.target as HTMLElement).style.display = 'none')"
          />
          <span class="special-title">Free</span>
        </button>
        <button
          type="button"
          class="special-btn special-current"
          title="标记为 Current（保持游戏内当前干员）"
          @click="selectSpecial('current')"
        >
          <img
            :src="getOperatorAvatarUrl('Current')"
            alt="Current"
            width="24"
            height="24"
            class="special-avatar"
            @error="(e) => ((e.target as HTMLElement).style.display = 'none')"
          />
          <span class="special-title">Current</span>
        </button>
      </div>
    </div>

    <!-- Operators 45px Avatar Grid -->
    <div class="operator-grid-wrapper">
      <div class="operator-grid">
        <div
          v-for="op in filteredOperators"
          :key="op.charId"
          class="operator-item"
          :class="{
            'is-assigned': Boolean(getAssignedRoom(op)),
            'is-duplicate': mode === 'replacement' && isDuplicateReplacement(op),
          }"
          :data-op-id="op.charId"
          :data-op-name="op.name"
          @click="selectOperator(op)"
        >
          <div class="avatar-wrapper">
            <img
              v-if="!imageErrors[op.charId]"
              :src="getOperatorAvatarUrl(op.charId)"
              :alt="op.name"
              width="45"
              height="45"
              class="operator-avatar"
              loading="lazy"
              @error="onImageError(op.charId)"
            />
            <div
              v-else
              class="operator-avatar-fallback avatar-fallback"
              :title="op.name"
            >
              {{ op.name }}
            </div>

            <!-- On-duty badge -->
            <span
              v-if="getAssignedRoom(op)"
              class="occupancy-tag badge-assigned"
              :title="`已在岗: ${getAssignedRoom(op)}`"
            >
              在岗
            </span>

            <!-- Replacement duplicate badge -->
            <span
              v-else-if="mode === 'replacement' && isDuplicateReplacement(op)"
              class="occupancy-tag badge-duplicate"
              title="已在当前槽的替换列表中"
            >
              已选
            </span>
          </div>

          <div class="operator-name-label" :title="op.name">
            {{ op.name }}
          </div>
        </div>
      </div>

      <div v-if="filteredOperators.length === 0" class="empty-state">
        无匹配干员
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <span class="result-hint">已显示 {{ filteredOperators.length }} 位干员</span>
        <n-button size="small" class="close-btn" @click="onClose">关闭</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
/**
 * Derivative work based on arknights-mower (PlanEditor.vue / SlickOperatorSelect.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { computed, ref, watch } from 'vue'
import { NButton, NInput, NModal } from 'naive-ui'
import { OPERATORS, type OperatorRecord } from '../../domain/operators'
import { useRosterWorkbenchStore } from '../../workbench/store'
import {
  buildOperatorSearchIndex,
  getAssignedSummaryMap,
  getOperatorAvatarUrl,
  getRoomDisplayName,
  searchOperators,
  type OperatorSearchItem,
} from '../../workbench/operatorHelpers'
import type { MowerRoomId } from '../../workbench/model'

export interface OperatorSelectionPayload {
  mode: 'main' | 'replacement'
  roomId: MowerRoomId
  slotIndex: number
  selectionKind: 'operator' | 'free' | 'current' | 'empty'
  operatorId?: string
  operatorName?: string
}

interface Props {
  open: boolean
  mode?: 'main' | 'replacement'
  roomId: MowerRoomId
  slotIndex: number
  to?: string | HTMLElement
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'main',
})

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'close'): void
  (e: 'selected', payload: OperatorSelectionPayload): void
}>()

const store = useRosterWorkbenchStore()

const searchIndex = buildOperatorSearchIndex(OPERATORS)
const searchQuery = ref('')
const imageErrors = ref<Record<string, boolean>>({})

function onImageError(charId: string) {
  if (!charId) return
  imageErrors.value = {
    ...imageErrors.value,
    [charId]: true,
  }
}

watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      searchQuery.value = ''
    }
  },
)

const roomName = computed<string>(() => {
  const facility = store.workspace.mainPlan.facilities[props.roomId]
  return getRoomDisplayName(props.roomId, facility?.type)
})

const modalTitle = computed<string>(() => {
  const slotNum = props.slotIndex + 1
  if (props.mode === 'main') {
    return `选择主槽干员 - ${roomName.value} (第${slotNum}位)`
  }
  return `添加替换干员 - ${roomName.value} (第${slotNum}位)`
})

const assignedSummaryMap = computed<Map<string, string>>(() => {
  return getAssignedSummaryMap(store.workspace.mainPlan)
})

const currentSlot = computed(() => {
  return store.workspace.mainPlan.facilities[props.roomId]?.slots[props.slotIndex]
})

const currentReplacements = computed<string[]>(() => {
  return currentSlot.value?.replacements ?? []
})

const filteredOperators = computed<OperatorSearchItem[]>(() => {
  return searchOperators(searchQuery.value, searchIndex, 80)
})

function getAssignedRoom(op: OperatorRecord): string | undefined {
  return assignedSummaryMap.value.get(op.charId) || assignedSummaryMap.value.get(op.name)
}

function isDuplicateReplacement(op: OperatorRecord): boolean {
  return currentReplacements.value.includes(op.charId) || currentReplacements.value.includes(op.name)
}

function selectOperator(op: OperatorRecord): void {
  if (props.mode === 'main') {
    store.updateSlotOccupant(props.roomId, props.slotIndex, {
      kind: 'operator',
      operatorId: op.charId,
    })
  } else {
    store.addReplacement(props.roomId, props.slotIndex, op.charId)
  }

  emit('selected', {
    mode: props.mode,
    roomId: props.roomId,
    slotIndex: props.slotIndex,
    selectionKind: 'operator',
    operatorId: op.charId,
    operatorName: op.name,
  })

  emit('update:open', false)
  emit('close')
}

function selectSpecial(kind: 'free' | 'current' | 'empty'): void {
  if (props.mode !== 'main') return

  store.updateSlotOccupant(props.roomId, props.slotIndex, { kind })

  emit('selected', {
    mode: props.mode,
    roomId: props.roomId,
    slotIndex: props.slotIndex,
    selectionKind: kind,
  })

  emit('update:open', false)
  emit('close')
}

function onClose(): void {
  emit('update:open', false)
  emit('close')
}

function onModalUpdateShow(val: boolean): void {
  if (!val) {
    onClose()
  }
}
</script>

<style scoped>
.mower-operator-modal {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.modal-search-row {
  margin-bottom: 12px;
}

.special-values-section {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.section-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 6px;
}

.special-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.special-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgb(51, 54, 57);
  color: #e0e0e0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.special-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: #2080f0;
  color: #fff;
}

.special-icon {
  font-size: 14px;
  font-weight: bold;
}

.special-avatar {
  border-radius: 2px;
}

.operator-grid-wrapper {
  max-height: 420px;
  overflow-y: auto;
  padding-right: 4px;
}

.operator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(54px, 1fr));
  gap: 8px 4px;
  justify-items: center;
}

.operator-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  box-sizing: border-box;
  transition: background 0.15s, transform 0.15s;
  width: 54px;
  user-select: none;
}

.operator-item:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}

.avatar-wrapper {
  position: relative;
  width: 45px;
  height: 45px;
  display: inline-flex;
}

.operator-avatar {
  width: 45px;
  height: 45px;
  border-radius: 2px;
  object-fit: cover;
  background: grey;
  display: block;
}

.operator-avatar-fallback {
  width: 45px;
  height: 45px;
  border-radius: 2px;
  background: #333639;
  color: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  text-align: center;
  line-height: 1.1;
  word-break: break-all;
  overflow: hidden;
}

.occupancy-tag {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  font-size: 9px;
  line-height: 12px;
  text-align: center;
  color: #fff;
  border-bottom-left-radius: 2px;
  border-bottom-right-radius: 2px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.badge-assigned {
  background: rgba(240, 160, 32, 0.9); /* Amber */
}

.badge-duplicate {
  background: rgba(32, 128, 240, 0.9); /* Naive info blue */
}

.operator-name-label {
  margin-top: 2px;
  font-size: 11px;
  line-height: 14px;
  color: rgba(255, 255, 255, 0.82);
  width: 52px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.empty-state {
  text-align: center;
  padding: 36px 0;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}
</style>
