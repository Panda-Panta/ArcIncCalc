<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseOperatorInventory, type OwnedOperatorInput } from '../../domain/operatorInventory'

const emit = defineEmits<{ change: [value: { enabled: boolean; valid: boolean; entries: OwnedOperatorInput[] }] }>()
const storageKey = 'arcinc-operator-inventory-v1'
const text = ref(''), enabled = ref(false), storageError = ref('')

try {
  const saved = localStorage.getItem(storageKey)
  if (saved) {
    const data = JSON.parse(saved)
    if (data.schemaVersion !== 1 || typeof data.text !== 'string' || typeof data.enabled !== 'boolean') throw new Error('invalid')
    text.value = data.text
    enabled.value = data.enabled
  }
} catch {
  storageError.value = '无法读取本地干员库；请重新粘贴，原存储不会自动覆盖。'
}

const parsed = computed(() => parseOperatorInventory(text.value))

watch([text, enabled], () => {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 1, text: text.value, enabled: enabled.value }))
    storageError.value = ''
  } catch {
    storageError.value = '本地保存失败，请检查浏览器存储配额。'
  }
})

watch([parsed, enabled], () => emit('change', { enabled: enabled.value, valid: parsed.value.valid, entries: parsed.value.entries }), { immediate: true })

function setInventoryText(newText: string, append = false): void {
  if (append && text.value.trim()) {
    text.value = text.value.trim() + '\n' + newText.trim()
  } else {
    text.value = newText.trim()
  }
  enabled.value = true
}

defineExpose({
  text,
  enabled,
  parsed,
  setInventoryText,
})
</script>

<template>
  <div class="operator-inventory" data-test="inventory-panel">
    <div class="inventory-header">
      <h3 class="inventory-title">我的干员库</h3>
      <span class="inventory-subtitle">录入实际持有干员与练度，用于排班准入与技能核验</span>
    </div>
    <label class="inventory-toggle">
      <input v-model="enabled" data-test="inventory-enabled" type="checkbox" />
      <span>运行模拟与自动排班时检查干员库</span>
    </label>
    <p v-if="!enabled" class="inventory-note">尚未启用检查：模拟继续沿用排班内干员的最高基建技能假设。</p>
    <label class="inventory-input">
      <span>持有干员与练度</span>
      <textarea
        v-model="text"
        data-test="inventory-text"
        rows="6"
        placeholder="砾,1,1&#10;温蒂,2,1&#10;Lancet-2,0,30"
      />
    </label>
    <div class="inventory-actions">
      <span>已录入 {{ parsed.operators.length }} 名干员</span>
    </div>
    <p v-if="storageError" class="inventory-error">{{ storageError }}</p>
    <ul v-if="parsed.diagnostics.length" class="inventory-error">
      <li v-for="(d, i) in parsed.diagnostics" :key="i">{{ d.message }}</li>
    </ul>
    <p class="inventory-note">
      启用后，未录入的参与者视为未持有。当前模拟要求实际技能与已核验的最高技能快照一致；不一致时停止评分。
    </p>
    <details v-if="parsed.operators.length" class="inventory-skills-details">
      <summary>查看实际已解锁技能（共 {{ parsed.operators.length }} 人）</summary>
      <ul class="inventory-skills">
        <li v-for="op in parsed.operators" :key="op.charId">
          <strong>{{ op.name }}</strong> · 精英 {{ op.elitePhase }} / {{ op.level }} 级：
          {{ op.skills.map(s => s.name).join('、') || '尚无已解锁基建技能' }}
          <span v-if="!op.matchesMaximumSkills" class="skill-mismatch-tag">（与最高技能模型不同）</span>
        </li>
      </ul>
    </details>
  </div>
</template>
<style scoped>
.operator-inventory{margin:1rem 0;padding:1rem;border:1px solid #526570;border-radius:8px;background:#14202a;color:#dfebf1;overflow-wrap:anywhere}.operator-inventory summary{cursor:pointer;font-weight:600}.operator-inventory p{line-height:1.6}.inventory-toggle,.inventory-actions{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}.inventory-input{display:grid;gap:.5rem;margin:1rem 0}.inventory-input textarea{width:100%;box-sizing:border-box;resize:vertical;background:#0f1922;color:inherit;border:1px solid #71818c;padding:.8rem;border-radius:5px;font:inherit}.inventory-actions button{padding:.5rem .8rem;border:1px solid #95ab67;background:#c7e49b;color:#16210d;border-radius:5px;cursor:pointer}.inventory-note{font-size:.85rem;color:#b6c6d1}.inventory-error{color:#ffb4ab}.inventory-skills{max-height:220px;overflow:auto;padding-left:1.4rem;line-height:1.8}.inventory-candidates{margin-top:1rem}.inventory-table{max-height:420px;overflow:auto;margin-top:.8rem}.inventory-table table{width:100%;border-collapse:collapse;min-width:480px}.inventory-table td,.inventory-table th{text-align:left;padding:.6rem;border-bottom:1px solid #42515e;vertical-align:top}.inventory-table th{position:sticky;top:0;background:#14202a}.inventory-table td p{margin:.3rem 0}.inventory-table td:first-child{width:40%}
</style>
