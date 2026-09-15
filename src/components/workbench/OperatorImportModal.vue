<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NButton,
  NModal,
  NTabPane,
  NTabs,
  NTooltip,
} from 'naive-ui'
import { parseMaaExport, parseSklandExport, inventoryToCsvText } from '../../domain/operatorImport'
import type { OwnedOperatorInput } from '../../domain/operatorInventory'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'imported', entries: OwnedOperatorInput[], text: string): void
}>()

const activeTab = ref<'maa' | 'skland'>('maa')
const maaText = ref('')
const sklandText = ref('')
const errorMessage = ref('')
const successMessage = ref('')

const storageKey = 'arcinc-operator-inventory-v1'

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    errorMessage.value = ''
    successMessage.value = ''
    maaText.value = ''
    sklandText.value = ''
  }
})

const parsedMaa = computed(() => {
  if (!maaText.value.trim()) return []
  return parseMaaExport(maaText.value)
})

const parsedSkland = computed(() => {
  if (!sklandText.value.trim()) return []
  return parseSklandExport(sklandText.value)
})

function handleImport(): void {
  errorMessage.value = ''
  successMessage.value = ''
  let entries: OwnedOperatorInput[] = []

  if (activeTab.value === 'maa') {
    entries = parsedMaa.value
    if (entries.length === 0) {
      errorMessage.value = '未能从输入内容中识别出有效的 MAA 干员数据，请检查输入格式。'
      return
    }
  } else {
    entries = parsedSkland.value
    if (entries.length === 0) {
      errorMessage.value = '未能从输入内容中识别出有效的森空岛干员数据，请确认粘贴了正确的 JSON。'
      return
    }
  }

  const csvText = inventoryToCsvText(entries)
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      schemaVersion: 1,
      text: csvText,
      enabled: true,
    }))
  } catch {
    // ignore quota
  }

  emit('imported', entries, csvText)
  emit('update:open', false)
}
</script>

<template>
  <n-modal
    :show="open"
    preset="card"
    title="导入干员库"
    class="operator-import-modal"
    style="width: 680px; max-width: 95vw;"
    :mask-closable="true"
    @update:show="emit('update:open', $event)"
  >
    <div class="import-content">
      <n-tabs v-model:value="activeTab" type="segment">
        <!-- MAA Tab -->
        <n-tab-pane name="maa" tab="导入 MAA 识别结果">
          <div class="tab-body">
            <div class="guide-banner">
              <div class="guide-title-row">
                <strong>MAA 干员识别结果导入说明</strong>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <span class="help-circle">?</span>
                  </template>
                  <div class="help-popover-text">
                    <strong>如何获取 MAA 识别结果？</strong><br />
                    1. 打开 MAA (MaaAssistantArknights) 桌面端；<br />
                    2. 在功能中选择「干员识别」或在排班助手导出干员数据；<br />
                    3. 复制生成的 JSON 或文本列表，粘贴到下方即可。
                  </div>
                </n-tooltip>
              </div>
              <p class="guide-desc">
                支持 MAA 导出的 JSON 数据结构（包含 <code>char_list</code> 或干员数组），也支持纯文本格式（每行格式：<code>干员名 精英等级 等级</code>）。
              </p>
            </div>

            <textarea
              v-model="maaText"
              class="import-textarea"
              rows="9"
              placeholder="在此粘贴 MAA 识别结果 JSON 或纯文本...&#10;示例：&#10;[{ &quot;name&quot;: &quot;银灰&quot;, &quot;elite&quot;: 2, &quot;level&quot;: 90 }, ...]&#10;或：&#10;银灰 2 90&#10;德克萨斯 2 80"
            />
            <div v-if="parsedMaa.length > 0" class="preview-tag">
              ✓ 已解析出 {{ parsedMaa.length }} 名干员数据
            </div>
          </div>
        </n-tab-pane>

        <!-- SKLand Tab -->
        <n-tab-pane name="skland" tab="森空岛导入">
          <div class="tab-body">
            <div class="guide-banner">
              <div class="guide-title-row">
                <strong>森空岛 (SKLand) 数据导入说明</strong>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <span class="help-circle">?</span>
                  </template>
                  <div class="help-popover-text">
                    <strong>如何从森空岛获取干员数据？</strong><br />
                    1. 登录森空岛网页版 (https://www.skland.com) 或森空岛 App；<br />
                    2. 打开明日方舟角色名片页面；<br />
                    3. 复制获取到的接口响应数据 JSON（包含 <code>chars</code> 或 <code>data.chars</code> 数组）；<br />
                    4. 粘贴至下方输入框即可一键识别。
                  </div>
                </n-tooltip>
              </div>
              <p class="guide-desc">
                支持森空岛官方角色数据接口 JSON（包含干员代号、精英化阶段与等级）。
              </p>
            </div>

            <textarea
              v-model="sklandText"
              class="import-textarea"
              rows="9"
              placeholder="在此粘贴森空岛导出的角色 JSON 数据...&#10;示例：&#10;{ &quot;code&quot;: 0, &quot;data&quot;: { &quot;chars&quot;: [{ &quot;charId&quot;: &quot;char_002_amiya&quot;, &quot;evolvePhase&quot;: 2, &quot;level&quot;: 80 }, ...] } }"
            />
            <div v-if="parsedSkland.length > 0" class="preview-tag">
              ✓ 已解析出 {{ parsedSkland.length }} 名干员数据
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>

      <div v-if="errorMessage" class="error-banner">
        ✕ {{ errorMessage }}
      </div>

      <div class="modal-actions">
        <n-button @click="emit('update:open', false)">取消</n-button>
        <n-button
          type="primary"
          :disabled="(activeTab === 'maa' && parsedMaa.length === 0) || (activeTab === 'skland' && parsedSkland.length === 0)"
          @click="handleImport"
        >
          确认导入至干员库
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.import-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 8px;
}

.guide-banner {
  padding: 10px 14px;
  background: rgba(66, 214, 199, 0.08);
  border: 1px solid rgba(66, 214, 199, 0.25);
  border-radius: 4px;
}

.guide-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: #42d6c7;
  font-size: 13px;
}

.help-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: rgba(66, 214, 199, 0.2);
  color: #42d6c7;
  font-size: 11px;
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

.guide-desc code {
  color: #42d6c7;
  background: rgba(0, 0, 0, 0.25);
  padding: 1px 4px;
  border-radius: 3px;
}

.import-textarea {
  width: 100%;
  box-sizing: border-box;
  background: #101922;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #e9f2f4;
  padding: 10px;
  font-family: Consolas, monospace;
  font-size: 12px;
  resize: vertical;
  outline: none;
}

.import-textarea:focus {
  border-color: #42d6c7;
}

.preview-tag {
  color: #63e2b7;
  font-size: 12px;
  font-weight: 500;
}

.error-banner {
  padding: 8px 12px;
  background: rgba(208, 48, 80, 0.15);
  border: 1px solid rgba(208, 48, 80, 0.4);
  border-radius: 4px;
  color: #ff7875;
  font-size: 13px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
