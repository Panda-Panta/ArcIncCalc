<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NButton,
  NModal,
  NRadio,
  NRadioGroup,
  NTabPane,
  NTabs,
  NTooltip,
} from 'naive-ui'
import {
  detectAndParseOperatorData,
  parseSklandExport,
  parseYituliuText,
  inventoryToCsvText,
  deduplicateOperatorEntries,
  type OperatorImportSummary,
} from '../../domain/operatorImport'
import { parseOperatorInventory, type OwnedOperatorInput } from '../../domain/operatorInventory'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'imported', entries: OwnedOperatorInput[], text: string): void
}>()

const activeTab = ref<'auto' | 'maa' | 'yituliu' | 'skland'>('auto')
const autoFile = ref<{ name: string; summary: OperatorImportSummary } | null>(null)
const maaText = ref('')
const yituliuText = ref('')
const sklandText = ref('')
const errorMessage = ref('')
const isDragOver = ref(false)
const importMode = ref<'replace' | 'merge'>('replace')
const fileInputRef = ref<HTMLInputElement | null>(null)

const storageKey = 'arcinc-operator-inventory-v1'

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    errorMessage.value = ''
    autoFile.value = null
    maaText.value = ''
    yituliuText.value = ''
    sklandText.value = ''
    isDragOver.value = false
  }
})

// Parsers for each tab
const parsedMaa = computed(() => {
  if (!maaText.value.trim()) return null
  return detectAndParseOperatorData(maaText.value, 'maa.txt')
})

const parsedYituliu = computed(() => {
  if (!yituliuText.value.trim()) return null
  const res = parseYituliuText(yituliuText.value)
  return {
    source: 'yituliu' as const,
    format: '一图流表格文本',
    entries: res.entries,
    totalInFile: res.totalInFile,
    unownedCount: res.unownedCount,
  }
})

const parsedSkland = computed(() => {
  if (!sklandText.value.trim()) return null
  const entries = parseSklandExport(sklandText.value)
  return {
    source: 'skland' as const,
    format: '森空岛角色数据 (JSON)',
    entries,
    totalInFile: entries.length,
    unownedCount: 0,
  }
})

// Active summary depending on tab
const currentSummary = computed<OperatorImportSummary | null>(() => {
  if (activeTab.value === 'auto') {
    return autoFile.value?.summary ?? null
  }
  if (activeTab.value === 'maa') {
    return parsedMaa.value
  }
  if (activeTab.value === 'yituliu') {
    return parsedYituliu.value
  }
  if (activeTab.value === 'skland') {
    return parsedSkland.value
  }
  return null
})

function triggerFileInput(): void {
  fileInputRef.value?.click()
}

async function processFile(file: File): Promise<void> {
  errorMessage.value = ''
  try {
    const isXlsx = file.name.endsWith('.xlsx')
    if (isXlsx) {
      const buffer = await file.arrayBuffer()
      const summary = detectAndParseOperatorData(buffer, file.name)
      if (summary.error) {
        errorMessage.value = summary.error
        return
      }
      autoFile.value = { name: file.name, summary }
      activeTab.value = 'auto'
    } else {
      const text = await file.text()
      const summary = detectAndParseOperatorData(text, file.name)
      if (summary.error) {
        errorMessage.value = summary.error
        return
      }
      autoFile.value = { name: file.name, summary }
      activeTab.value = 'auto'
    }
  } catch (err: unknown) {
    errorMessage.value = `读取文件失败：${err instanceof Error ? err.message : String(err)}`
  }
}

function handleFileSelect(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    processFile(file)
  }
  target.value = ''
}

function handleFileDrop(event: DragEvent): void {
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    processFile(file)
  }
}

function handleImport(): void {
  errorMessage.value = ''
  const summary = currentSummary.value
  if (!summary || summary.entries.length === 0) {
    errorMessage.value = '未能解析到有效的干员数据，请检查文件或输入内容。'
    return
  }

  let finalEntries = summary.entries

  if (importMode.value === 'merge') {
    const existingRaw = localStorage.getItem(storageKey)
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw)
        if (parsed.text) {
          const existingEntries = parseOperatorInventory(parsed.text).entries
          finalEntries = deduplicateOperatorEntries([...existingEntries, ...finalEntries])
        }
      } catch {
        // ignore
      }
    }
  }

  const csvText = inventoryToCsvText(finalEntries)
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      schemaVersion: 1,
      text: csvText,
      enabled: true,
    }))
  } catch {
    // ignore quota
  }

  emit('imported', finalEntries, csvText)
  emit('update:open', false)
}
</script>

<template>
  <n-modal
    :show="open"
    preset="card"
    title="导入干员库（支持 MAA 与 一图流）"
    class="operator-import-modal"
    style="width: 720px; max-width: 95vw;"
    :mask-closable="true"
    @update:show="emit('update:open', $event)"
  >
    <div class="import-content">
      <!-- Universal File Dropzone -->
      <div
        class="file-dropzone"
        :class="{ 'is-dragover': isDragOver }"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleFileDrop"
        @click="triggerFileInput"
      >
        <input
          ref="fileInputRef"
          type="file"
          accept=".xlsx,.json,.csv,.md,.txt"
          style="display: none"
          @change="handleFileSelect"
        />
        <div class="dropzone-icon">📥</div>
        <div class="dropzone-text">
          <strong>点击选择文件</strong> 或直接将文件拖拽至此处
        </div>
        <div class="dropzone-hint">
          支持 MAA 导出文件 (<code>.json</code>, <code>.csv</code>, <code>.md</code>) 与 一图流练度导表 (<code>.xlsx</code>)
        </div>
      </div>

      <!-- Tabs for clipboard paste and specialized guides -->
      <n-tabs v-model:value="activeTab" type="segment">
        <!-- Auto / File Upload Result Tab -->
        <n-tab-pane name="auto" tab="已解析文件">
          <div class="tab-body">
            <div v-if="autoFile" class="file-loaded-banner">
              <div class="file-badge">📄 {{ autoFile.name }}</div>
              <div class="file-status">
                识别格式：<strong>{{ autoFile.summary.format }}</strong>
              </div>
            </div>
            <div v-else class="empty-file-tip">
              暂未上传文件，请在上方区域选择或拖入 <code>.xlsx</code>、<code>.json</code>、<code>.csv</code>、<code>.md</code> 文件，或切换到对应标签页粘贴文本。
            </div>
          </div>
        </n-tab-pane>

        <!-- MAA Tab -->
        <n-tab-pane name="maa" tab="MAA 识别结果 (粘贴)">
          <div class="tab-body">
            <div class="guide-banner">
              <div class="guide-title-row">
                <strong>MAA 导出结果导入说明</strong>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <span class="help-circle">?</span>
                  </template>
                  <div class="help-popover-text">
                    <strong>如何获取 MAA 导出结果？</strong><br />
                    1. 打开 MAA 桌面端，进入「干员识别」或「排班助手」；<br />
                    2. 点击导出，可选择导出的 JSON、CSV 或 Markdown 文件；<br />
                    3. 在上方拖入导出的文件，或复制文件文本内容粘贴到下方。
                  </div>
                </n-tooltip>
              </div>
              <p class="guide-desc">
                支持 MAA 导出的 <strong>JSON</strong>（<code>Arknights_OperBox_Export.json</code>）、<strong>CSV</strong>（<code>Arknights_OperBox_Export.csv</code>）与 <strong>Markdown</strong>（<code>Arknights_OperBox_Export.md</code>），会自动过滤未持有的干员。
              </p>
            </div>

            <textarea
              v-model="maaText"
              class="import-textarea"
              rows="6"
              placeholder="在此粘贴 MAA 导出文件内容（JSON、CSV 或 Markdown 表格）..."
            />
          </div>
        </n-tab-pane>

        <!-- Yituliu Tab -->
        <n-tab-pane name="yituliu" tab="一图流导表 (粘贴)">
          <div class="tab-body">
            <div class="guide-banner">
              <div class="guide-title-row">
                <strong>一图流网站 (yituliu.site) 导表说明</strong>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <span class="help-circle">?</span>
                  </template>
                  <div class="help-popover-text">
                    <strong>如何获取一图流导表？</strong><br />
                    1. 访问一图流网站干员练度测算/导入页面；<br />
                    2. 点击「导出干员练度表 (.xlsx)」；<br />
                    3. 直接将下载的 <code>一图流-干员练度表.xlsx</code> 拖入上方上传区即可！
                  </div>
                </n-tooltip>
              </div>
              <p class="guide-desc">
                推荐直接将下载的 <code>一图流-干员练度表.xlsx</code> 拖拽到上方文件区域；若复制了网页表格文本也可粘贴到下方。
              </p>
            </div>

            <textarea
              v-model="yituliuText"
              class="import-textarea"
              rows="6"
              placeholder="在此粘贴一图流复制的表格文本（表头包含干员名称、是否已招募等）..."
            />
          </div>
        </n-tab-pane>

        <!-- SKLand Tab -->
        <n-tab-pane name="skland" tab="森空岛 (JSON)">
          <div class="tab-body">
            <div class="guide-banner">
              <div class="guide-title-row">
                <strong>森空岛 (SKLand) 数据导入说明</strong>
              </div>
              <p class="guide-desc">
                支持森空岛官方角色名片数据 JSON（包含 <code>data.chars</code> 数组）。
              </p>
            </div>

            <textarea
              v-model="sklandText"
              class="import-textarea"
              rows="6"
              placeholder="在此粘贴森空岛导出的角色名片 JSON 数据..."
            />
          </div>
        </n-tab-pane>
      </n-tabs>

      <!-- Recognition Statistics & Preview -->
      <div v-if="currentSummary && currentSummary.entries.length > 0" class="recognition-panel">
        <div class="recognition-header">
          <div class="rec-tag">
            ✓ {{ currentSummary.format }}
          </div>
          <div class="rec-stat">
            已成功识别 <strong>{{ currentSummary.entries.length }}</strong> 名持有干员
            <span v-if="currentSummary.unownedCount > 0" class="unowned-stat">
              （已排除 {{ currentSummary.unownedCount }} 名未持有干员）
            </span>
          </div>
        </div>

        <!-- Sample preview chips -->
        <div class="preview-chips-container">
          <span class="preview-label">识别样本预览：</span>
          <div class="preview-chips">
            <div
              v-for="op in currentSummary.entries.slice(0, 10)"
              :key="op.operator"
              class="operator-preview-chip"
            >
              <img
                class="chip-avatar"
                :src="'/avatar/' + encodeURIComponent(op.operator) + '.webp'"
                :alt="op.operator"
                @error="($event.target as HTMLElement).style.display = 'none'"
              />
              <span class="chip-name">{{ op.operator }}</span>
              <span class="chip-elite">精{{ op.elitePhase }}</span>
              <span class="chip-level">{{ op.level }}级</span>
            </div>
            <div v-if="currentSummary.entries.length > 10" class="preview-more-tag">
              + 另外 {{ currentSummary.entries.length - 10 }} 名干员
            </div>
          </div>
        </div>

        <!-- Import Mode Selection -->
        <div class="import-mode-row">
          <span class="mode-label">导入模式：</span>
          <n-radio-group v-model:value="importMode" name="import-mode">
            <n-radio value="replace">
              覆盖当前干员库
            </n-radio>
            <n-radio value="merge">
              合并/追加更新（保留未在此文件出现的干员）
            </n-radio>
          </n-radio-group>
        </div>
      </div>

      <div v-if="errorMessage" class="error-banner">
        ✕ {{ errorMessage }}
      </div>

      <div class="modal-actions">
        <n-button @click="emit('update:open', false)">取消</n-button>
        <n-button
          type="primary"
          :disabled="!currentSummary || currentSummary.entries.length === 0"
          @click="handleImport"
        >
          确认导入至干员库（{{ currentSummary?.entries.length ?? 0 }} 人）
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.import-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* File Dropzone */
.file-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  background: rgba(66, 214, 199, 0.04);
  border: 2px dashed rgba(66, 214, 199, 0.35);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.file-dropzone:hover,
.file-dropzone.is-dragover {
  background: rgba(66, 214, 199, 0.1);
  border-color: #42d6c7;
  transform: translateY(-1px);
}

.dropzone-icon {
  font-size: 28px;
  margin-bottom: 6px;
}

.dropzone-text {
  font-size: 14px;
  color: #e0f2f1;
  margin-bottom: 4px;
}

.dropzone-text strong {
  color: #42d6c7;
}

.dropzone-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.dropzone-hint code {
  color: #42d6c7;
  background: rgba(0, 0, 0, 0.3);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
}

.tab-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
}

.file-loaded-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(66, 214, 199, 0.12);
  border: 1px solid rgba(66, 214, 199, 0.35);
  border-radius: 6px;
}

.file-badge {
  font-weight: bold;
  color: #42d6c7;
  font-size: 13px;
}

.file-status {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

.empty-file-tip {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
}

.guide-banner {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.guide-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: #42d6c7;
  font-size: 12px;
}

.help-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(66, 214, 199, 0.2);
  color: #42d6c7;
  font-size: 10px;
  font-weight: bold;
  cursor: help;
}

.help-popover-text {
  font-size: 12px;
  line-height: 1.6;
  max-width: 320px;
}

.guide-desc {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.import-textarea {
  width: 100%;
  box-sizing: border-box;
  background: #0d161d;
  color: #e0f2f1;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 10px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}

.import-textarea:focus {
  outline: none;
  border-color: #42d6c7;
}

/* Recognition Panel */
.recognition-panel {
  padding: 12px 14px;
  background: #14202a;
  border: 1px solid rgba(66, 214, 199, 0.3);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recognition-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.rec-tag {
  font-size: 12px;
  font-weight: bold;
  color: #10b981;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.35);
  padding: 2px 8px;
  border-radius: 4px;
}

.rec-stat {
  font-size: 13px;
  color: #e0f2f1;
}

.unowned-stat {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.preview-chips-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.preview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 110px;
  overflow-y: auto;
}

.operator-preview-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 4px;
  background: #0a1118;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  font-size: 11px;
}

.chip-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.chip-name {
  color: #fff;
  font-weight: 500;
}

.chip-elite {
  color: #42d6c7;
  font-size: 10px;
}

.chip-level {
  color: #f59e0b;
  font-size: 10px;
}

.preview-more-tag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  padding: 2px 6px;
}

.import-mode-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 6px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  font-size: 12px;
}

.mode-label {
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
}

.error-banner {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  font-size: 12px;
  border-radius: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}
</style>
