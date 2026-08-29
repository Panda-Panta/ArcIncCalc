<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { factionLabel, OPERATORS, type OperatorRecord } from '../domain/operators'
import type { RoomType } from '../domain/types'

const props = defineProps<{
  open: boolean
  targetLabel: string
  roomType: RoomType | 'control'
  capacity: number
  selectedIds: string[]
  assignedTo: Record<string, string>
}>()

const emit = defineEmits<{
  close: []
  apply: [ids: string[]]
}>()

const search = ref('')
const relevantOnly = ref(true)
const draft = ref<string[]>([])

const gameRoomType = computed(() =>
  props.roomType === 'control' ? 'CONTROL' : props.roomType.toUpperCase(),
)

watch(
  () => props.open,
  (open) => {
    if (open) {
      draft.value = [...props.selectedIds]
      search.value = ''
      relevantOnly.value = true
    }
  },
)

function relevantSkills(operator: OperatorRecord) {
  return operator.skills.filter((skill) => skill.roomType === gameRoomType.value)
}

const filteredOperators = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return OPERATORS.filter((operator) => {
    const skills = relevantSkills(operator)
    if (relevantOnly.value && skills.length === 0 && !draft.value.includes(operator.charId)) return false
    if (!query) return true
    return (
      operator.name.toLocaleLowerCase().includes(query) ||
      operator.appellation.toLocaleLowerCase().includes(query) ||
      skills.some(
        (skill) =>
          skill.name.toLocaleLowerCase().includes(query) ||
          skill.description.toLocaleLowerCase().includes(query),
      )
    )
  })
    .sort((left, right) => {
      const selected = Number(draft.value.includes(right.charId)) - Number(draft.value.includes(left.charId))
      const relevant = Number(relevantSkills(right).length > 0) - Number(relevantSkills(left).length > 0)
      return selected || relevant || right.rarity - left.rarity || left.name.localeCompare(right.name, 'zh-CN')
    })
    .slice(0, 160)
})

function unavailable(operator: OperatorRecord) {
  return Boolean(props.assignedTo[operator.charId]) && !draft.value.includes(operator.charId)
}

function toggle(operator: OperatorRecord) {
  if (unavailable(operator)) return
  const index = draft.value.indexOf(operator.charId)
  if (index >= 0) {
    draft.value.splice(index, 1)
    return
  }
  if (draft.value.length < props.capacity) draft.value.push(operator.charId)
}

function apply() {
  emit('apply', [...draft.value])
  emit('close')
}

function clearDraft() {
  draft.value = []
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="picker-backdrop" role="presentation" @mousedown.self="emit('close')">
      <section class="picker" role="dialog" aria-modal="true" :aria-label="`为${targetLabel}选择干员`">
        <header>
          <div>
            <p>OPERATOR ASSIGNMENT</p>
            <h2>{{ targetLabel }} · 选择干员</h2>
          </div>
          <button type="button" aria-label="关闭干员选择" @click="emit('close')">×</button>
        </header>

        <div class="picker-toolbar">
          <input v-model="search" type="search" placeholder="搜索干员、技能或效果" autofocus />
          <label>
            <input v-model="relevantOnly" type="checkbox" />
            仅显示当前设施技能
          </label>
          <strong>{{ draft.length }}/{{ capacity }}</strong>
        </div>

        <div class="operator-list">
          <button
            v-for="operator in filteredOperators"
            :key="operator.charId"
            type="button"
            class="operator-option"
            :class="{ selected: draft.includes(operator.charId), unavailable: unavailable(operator) }"
            :disabled="unavailable(operator)"
            @click="toggle(operator)"
          >
            <span class="operator-sigil">{{ operator.name.slice(0, 1) }}</span>
            <span class="operator-main">
              <span class="operator-title">
                <b>{{ operator.name }}</b>
                <i>{{ '★'.repeat(operator.rarity) }}</i>
                <small>{{ factionLabel(operator) }}</small>
              </span>
              <template v-if="relevantSkills(operator).length">
                <span v-for="skill in relevantSkills(operator)" :key="skill.buffId" class="skill-line">
                  <b>{{ skill.name }}</b>
                  <small>{{ skill.description }}</small>
                </span>
              </template>
              <span v-else class="skill-line empty">无当前设施技能，仅提供进驻基础加成</span>
              <em v-if="unavailable(operator)">已进驻 {{ assignedTo[operator.charId] }}</em>
            </span>
            <span class="selection-mark">{{ draft.includes(operator.charId) ? '✓' : '+' }}</span>
          </button>
        </div>

        <footer>
          <span>按精英 2 / 最高已解锁基建技能计算</span>
          <div>
            <button type="button" class="secondary" @click="clearDraft">清空</button>
            <button type="button" class="primary" @click="apply">应用 {{ draft.length }} 名干员</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(2, 8, 11, .78);
  backdrop-filter: blur(8px);
}
.picker {
  width: min(920px, calc(100vw - 80px));
  height: min(760px, calc(100vh - 70px));
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  color: #e9f2f4;
  background: #0d1a20;
  border: 1px solid rgba(173, 209, 216, .22);
  border-top: 3px solid #42d6c7;
  box-shadow: 0 30px 90px rgba(0,0,0,.55);
}
.picker > header { display: flex; justify-content: space-between; align-items: center; padding: 18px 21px; border-bottom: 1px solid rgba(173,209,216,.14); }
.picker header p { margin: 0 0 5px; color: #42d6c7; font: 600 10px/1 Consolas, monospace; letter-spacing: .15em; }
.picker header h2 { margin: 0; font-size: 19px; }
.picker header button { width: 34px; height: 34px; color: #8da5ac; background: transparent; border: 1px solid rgba(173,209,216,.14); cursor: pointer; font-size: 22px; }
.picker-toolbar { display: grid; grid-template-columns: 1fr auto 55px; align-items: center; gap: 14px; padding: 13px 20px; background: #101f26; border-bottom: 1px solid rgba(173,209,216,.14); }
.picker-toolbar input[type='search'] { min-height: 38px; padding: 0 12px; color: #fff; background: #081319; border: 1px solid rgba(173,209,216,.18); }
.picker-toolbar label { display: flex; gap: 7px; align-items: center; color: #8da5ac; font-size: 11px; }
.picker-toolbar label input { width: 16px; min-height: 16px; accent-color: #42d6c7; }
.picker-toolbar strong { color: #42d6c7; text-align: right; font: 700 16px/1 Consolas, monospace; }
.operator-list { overflow-y: auto; padding: 10px 14px 18px; }
.operator-option { width: 100%; display: grid; grid-template-columns: 42px 1fr 30px; gap: 12px; align-items: start; padding: 12px; margin-bottom: 7px; text-align: left; color: #e9f2f4; background: #0a161c; border: 1px solid rgba(173,209,216,.12); cursor: pointer; }
.operator-option:hover { border-color: rgba(66,214,199,.45); background: #102229; }
.operator-option.selected { border-color: #42d6c7; background: rgba(66,214,199,.08); }
.operator-option.unavailable { opacity: .45; cursor: not-allowed; }
.operator-sigil { width: 40px; height: 40px; display: grid; place-items: center; color: #071015; background: #83aaa9; font-weight: 800; clip-path: polygon(0 0, 80% 0, 100% 20%, 100% 100%, 20% 100%, 0 80%); }
.operator-main { min-width: 0; display: grid; gap: 6px; }
.operator-title { display: flex; align-items: baseline; gap: 9px; }
.operator-title b { font-size: 14px; }
.operator-title i { color: #f0bd5b; font-size: 8px; font-style: normal; letter-spacing: -1px; }
.operator-title small { color: #71888e; font-size: 10px; }
.skill-line { display: grid; grid-template-columns: 130px 1fr; gap: 8px; color: #8da5ac; font-size: 10px; }
.skill-line b { color: #bdd0d4; font-weight: 600; }
.skill-line small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skill-line.empty { display: block; color: #53686e; }
.operator-main em { color: #f08a55; font-size: 9px; font-style: normal; }
.selection-mark { color: #42d6c7; font: 700 18px/1 Consolas, monospace; text-align: center; }
.picker > footer { display: flex; justify-content: space-between; align-items: center; padding: 13px 20px; border-top: 1px solid rgba(173,209,216,.14); background: #101f26; }
.picker footer > span { color: #71888e; font-size: 10px; }
.picker footer div { display: flex; gap: 8px; }
.picker footer button { min-height: 36px; padding: 0 15px; cursor: pointer; }
.secondary { color: #8da5ac; background: transparent; border: 1px solid rgba(173,209,216,.18); }
.primary { color: #071015; background: #42d6c7; border: 1px solid #42d6c7; font-weight: 700; }
</style>
