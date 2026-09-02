<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { factionLabel, OPERATORS, type OperatorRecord } from '../domain/operators'
import type { RoomType } from '../domain/types'

type FacilityRoomType =
  | RoomType
  | 'control'
  | 'dormitory'
  | 'meeting'
  | 'workshop'
  | 'training'
  | 'hire'

const props = withDefaults(defineProps<{
  modelValue: string
  roomType: FacilityRoomType
  assignedTo: Record<string, string>
  disabled?: boolean
  placeholder?: string
}>(), { disabled: false, placeholder: '选择干员' })

const emit = defineEmits<{ 'update:modelValue': [operatorId: string] }>()
const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const search = ref('')
const gameRoomTypes: Record<FacilityRoomType, string> = {
  manufacture: 'MANUFACTURE',
  trading: 'TRADING',
  power: 'POWER',
  control: 'CONTROL',
  dormitory: 'DORMITORY',
  meeting: 'MEETING',
  workshop: 'WORKSHOP',
  training: 'TRAINING',
  hire: 'HIRE',
}
const gameRoomType = computed(() => gameRoomTypes[props.roomType])
const selectedOperator = computed(() => OPERATORS.find((operator) => operator.charId === props.modelValue))

function roomSkills(operator: OperatorRecord) {
  return operator.skills.filter((skill) => skill.roomType === gameRoomType.value)
}

const visibleOperators = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return OPERATORS
    .filter((operator) => {
      const skills = roomSkills(operator)
      return !keyword || operator.name.toLocaleLowerCase().includes(keyword)
        || operator.appellation.toLocaleLowerCase().includes(keyword)
        || factionLabel(operator).toLocaleLowerCase().includes(keyword)
        || skills.some((skill) => skill.name.toLocaleLowerCase().includes(keyword)
          || skill.description.toLocaleLowerCase().includes(keyword))
    })
    .sort((left, right) => {
      if (left.charId === props.modelValue) return -1
      if (right.charId === props.modelValue) return 1
      const relevant = Number(roomSkills(right).length > 0) - Number(roomSkills(left).length > 0)
      return relevant || right.rarity - left.rarity || left.name.localeCompare(right.name, 'zh-CN')
    })
    .slice(0, 100)
})

function isReserved(operatorId: string) {
  return operatorId !== props.modelValue && Boolean(props.assignedTo[operatorId])
}
function toggle() { if (!props.disabled) open.value = !open.value }
function choose(operatorId: string) {
  if (operatorId && isReserved(operatorId)) return
  emit('update:modelValue', operatorId)
  open.value = false
  search.value = ''
}
function closeFromOutside(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}
watch(open, async (isOpen) => {
  if (!isOpen) return
  search.value = ''
  await nextTick()
  searchInput.value?.focus()
})
onMounted(() => document.addEventListener('pointerdown', closeFromOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeFromOutside))
</script>

<template>
  <div ref="root" class="inline-operator-select" :class="{ open, disabled }">
    <button class="operator-trigger" type="button" :disabled="disabled" @click="toggle">
      <span class="operator-trigger-copy">
        <b>{{ selectedOperator?.name ?? placeholder }}</b>
        <small v-if="selectedOperator">{{ roomSkills(selectedOperator)[0]?.name ?? '无当前设施技能' }}</small>
      </span>
      <span class="operator-chevron">⌄</span>
    </button>
    <div v-if="open" class="operator-popover">
      <div class="operator-search-row">
        <input ref="searchInput" v-model="search" type="search" placeholder="搜索干员或技能" />
        <button v-if="modelValue" type="button" @click="choose('')">清空</button>
      </div>
      <div class="operator-options">
        <button
          v-for="operator in visibleOperators"
          :key="operator.charId"
          class="operator-option"
          :class="{ selected: operator.charId === modelValue, reserved: isReserved(operator.charId) }"
          type="button"
          :disabled="isReserved(operator.charId)"
          @click="choose(operator.charId)"
        >
          <span class="operator-option-main">
            <span class="operator-option-title">
              <b>{{ operator.name }}</b>
              <i>{{ '★'.repeat(operator.rarity) }}</i>
            </span>
            <small>{{ roomSkills(operator)[0]?.name ?? '无当前设施技能' }}</small>
          </span>
          <span v-if="isReserved(operator.charId)" class="operator-state">已占用</span>
          <span v-else-if="operator.charId === modelValue" class="operator-state">当前</span>
        </button>
        <p v-if="!visibleOperators.length" class="operator-empty">没有匹配的干员</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inline-operator-select { min-width: 0; position: relative; }
.operator-trigger { align-items: center; background: #0c191f; border: 1px solid rgba(173, 209, 216, .18); color: #e9f2f4; cursor: pointer; display: flex; gap: 8px; justify-content: space-between; min-height: 42px; padding: 5px 8px; text-align: left; width: 100%; }
.operator-trigger:hover, .open .operator-trigger { border-color: rgba(66, 214, 199, .65); }
.operator-trigger:disabled { color: #566970; cursor: not-allowed; opacity: .65; }
.operator-trigger-copy, .operator-option-main { display: grid; min-width: 0; }
.operator-trigger-copy b, .operator-trigger-copy small, .operator-option-main b, .operator-option-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.operator-trigger-copy b, .operator-option-main b { font-size: 12px; font-weight: 650; }
.operator-trigger-copy small, .operator-option-main small { color: #71888e; font-size: 9px; }
.operator-chevron { color: #42d6c7; flex: 0 0 auto; font-size: 16px; }
.operator-popover { background: #0d1a20; border: 1px solid rgba(66, 214, 199, .45); box-shadow: 0 16px 40px rgba(0, 0, 0, .48); left: 0; min-width: 330px; padding: 7px; position: absolute; top: calc(100% + 4px); z-index: 40; }
.operator-search-row { display: grid; gap: 6px; grid-template-columns: minmax(0, 1fr) auto; margin-bottom: 6px; }
.operator-search-row input { background: #081319; border: 1px solid rgba(173, 209, 216, .18); color: #e9f2f4; min-width: 0; padding: 7px 8px; }
.operator-search-row button { background: #18282f; border: 1px solid rgba(173, 209, 216, .14); color: #8da5ac; cursor: pointer; padding: 0 9px; }
.operator-options { display: grid; max-height: 310px; overflow: auto; }
.operator-option { align-items: center; background: transparent; border: 0; color: #e9f2f4; cursor: pointer; display: grid; gap: 8px; grid-template-columns: minmax(0, 1fr) auto; padding: 7px 8px; text-align: left; }
.operator-option:hover, .operator-option.selected { background: rgba(66, 214, 199, .1); }
.operator-option.reserved { cursor: not-allowed; opacity: .42; }
.operator-option-title { align-items: baseline; display: flex; gap: 6px; min-width: 0; }
.operator-option-title i { color: #f0bd5b; font-size: 7px; font-style: normal; letter-spacing: -1px; }
.operator-state { color: #42d6c7; font-size: 9px; }
.operator-empty { color: #71888e; font-size: 11px; margin: 18px 0; text-align: center; }
</style>
