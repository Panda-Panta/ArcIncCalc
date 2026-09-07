<template>
  <div class="mower-validation-panel plan-container" :class="{ 'has-errors': hasErrors }">
    <div class="validation-panel-header">
      <div class="header-left">
        <span class="panel-title">排班校验与诊断</span>
        <span v-if="hasIssues" class="issue-counts">
          <span v-if="criticalCount > 0" class="badge badge-critical">{{ criticalCount }} 个阻断错误</span>
          <span v-if="warningCount > 0" class="badge badge-warning">{{ warningCount }} 个警告</span>
        </span>
      </div>

      <div v-if="powerSummary" class="power-summary">
        <span class="power-item">发电: {{ powerSummary.generation }}</span>
        <span class="power-item">耗电: {{ powerSummary.consumption }}</span>
        <span
          class="power-item power-margin"
          :class="{ 'is-negative': !powerSummary.sufficient }"
        >
          余量: {{ powerSummary.margin >= 0 ? `+${powerSummary.margin}` : powerSummary.margin }}
        </span>
      </div>
    </div>

    <!-- Zero state -->
    <div v-if="!hasIssues" class="validation-zero-state" data-test="zero-state">
      <span class="zero-state-icon">✔</span>
      <span class="zero-state-text">排班校验通过，未发现冲突或异常</span>
    </div>

    <!-- Issues container -->
    <div v-else class="validation-groups">
      <!-- Critical Errors Group -->
      <div
        v-if="criticalErrors.length > 0"
        class="validation-group critical-group"
        data-test="critical-group"
      >
        <div class="group-header">
          <span class="group-badge badge-critical">阻断</span>
          <span class="group-title">严重错误（阻断收益计算）</span>
          <span class="group-count">({{ criticalErrors.length }})</span>
        </div>
        <div class="issues-list">
          <div
            v-for="(issue, idx) in criticalErrors"
            :key="`critical-${idx}`"
            class="issue-item is-critical"
            :data-test="`critical-issue-${idx}`"
            :data-room-id="issue.roomId"
            :data-slot-index="issue.slotIndex"
            :data-policy-key="(issue as any).policyKey"
            role="button"
            tabindex="0"
            @click="onIssueClick(issue)"
            @keydown.enter="onIssueClick(issue)"
          >
            <span class="issue-tag tag-critical">严重</span>
            <span v-if="getLocationLabel(issue)" class="issue-location">
              {{ getLocationLabel(issue) }}
            </span>
            <span class="issue-message">{{ issue.message }}</span>
            <span class="focus-arrow" title="聚焦此位置">➔</span>
          </div>
        </div>
      </div>

      <!-- Warnings Group -->
      <div
        v-if="warnings.length > 0"
        class="validation-group warning-group"
        data-test="warning-group"
      >
        <div class="group-header">
          <span class="group-badge badge-warning">警告</span>
          <span class="group-title">排班提示与警告（不阻断计算）</span>
          <span class="group-count">({{ warnings.length }})</span>
        </div>
        <div class="issues-list">
          <div
            v-for="(issue, idx) in warnings"
            :key="`warning-${idx}`"
            class="issue-item is-warning"
            :data-test="`warning-issue-${idx}`"
            :data-room-id="issue.roomId"
            :data-slot-index="issue.slotIndex"
            :data-policy-key="(issue as any).policyKey"
            role="button"
            tabindex="0"
            @click="onIssueClick(issue)"
            @keydown.enter="onIssueClick(issue)"
          >
            <span class="issue-tag tag-warning">警告</span>
            <span v-if="getLocationLabel(issue)" class="issue-location">
              {{ getLocationLabel(issue) }}
            </span>
            <span class="issue-message">{{ issue.message }}</span>
            <span class="focus-arrow" title="聚焦此位置">➔</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Derivative work based on arknights-mower (Plan.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { computed } from 'vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import {
  validateRosterWorkspace,
  type ValidationIssue,
  type ValidationPowerSummary,
  type ValidationResult,
} from '../../workbench/validate'
import { getRoomDisplayName } from '../../workbench/operatorHelpers'
import type { MowerRoomId } from '../../workbench/model'

export interface ValidationFocusPayload {
  roomId?: MowerRoomId | string
  slotIndex?: number
  policyKey?: string
  code?: string
  severity?: string
  message?: string
}

interface Props {
  result?: ValidationResult
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'focus', payload: ValidationFocusPayload): void
  (e: 'focus-room', roomId: string): void
}>()

const store = useRosterWorkbenchStore()

const activeResult = computed<ValidationResult>(() => {
  if (props.result) {
    return props.result
  }
  return validateRosterWorkspace(store.workspace)
})

const criticalErrors = computed<ValidationIssue[]>(() => activeResult.value.criticalErrors || [])
const warnings = computed<ValidationIssue[]>(() => activeResult.value.warnings || [])
const criticalCount = computed(() => criticalErrors.value.length)
const warningCount = computed(() => warnings.value.length)
const hasErrors = computed(() => criticalCount.value > 0)
const hasIssues = computed(() => criticalCount.value > 0 || warningCount.value > 0)
const powerSummary = computed<ValidationPowerSummary | undefined>(() => activeResult.value.power)

function getLocationLabel(issue: ValidationIssue | any): string {
  if (issue.policyKey) {
    return `策略 [${issue.policyKey}]`
  }
  if (!issue.roomId) return ''
  const facility = store.workspace.mainPlan.facilities?.[issue.roomId as MowerRoomId]
  const roomName = getRoomDisplayName(issue.roomId, facility?.type)
  if (issue.slotIndex !== undefined && issue.slotIndex !== null) {
    return `${roomName} 第${issue.slotIndex + 1}位`
  }
  return roomName
}

function onIssueClick(issue: ValidationIssue | any): void {
  const payload: ValidationFocusPayload = {}

  if (issue.roomId) {
    payload.roomId = issue.roomId
  }
  if (issue.slotIndex !== undefined && issue.slotIndex !== null) {
    payload.slotIndex = issue.slotIndex
  }
  const polKey = issue.policyKey || issue.confKey || issue.policy
  if (polKey) {
    payload.policyKey = polKey
  }
  if (issue.code) {
    payload.code = issue.code
  }
  if (issue.severity) {
    payload.severity = issue.severity
  }
  if (issue.message) {
    payload.message = issue.message
  }

  emit('focus', payload)

  if (payload.roomId) {
    emit('focus-room', payload.roomId)
  }
}
</script>

<style scoped>
.mower-validation-panel {
  width: 100%;
  max-width: 980px;
  margin: 12px auto;
  padding: 12px 16px;
  background: #18181c;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: rgba(255, 255, 255, 0.88);
}

.mower-validation-panel.has-errors {
  border-color: rgba(208, 48, 80, 0.4);
}

.validation-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.issue-counts {
  display: flex;
  gap: 6px;
}

.badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.badge-critical {
  background: rgba(208, 48, 80, 0.2);
  color: #e88080;
  border: 1px solid rgba(208, 48, 80, 0.35);
}

.badge-warning {
  background: rgba(240, 160, 32, 0.2);
  color: #f2c97d;
  border: 1px solid rgba(240, 160, 32, 0.35);
}

.power-summary {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.power-margin {
  color: #63e2b7;
}

.power-margin.is-negative {
  color: #e88080;
  font-weight: 600;
}

.validation-zero-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(99, 226, 183, 0.08);
  border: 1px solid rgba(99, 226, 183, 0.2);
  border-radius: 4px;
  color: #63e2b7;
  font-size: 13px;
}

.zero-state-icon {
  font-size: 15px;
  font-weight: bold;
}

.validation-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.validation-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.group-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
}

.group-title {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.group-count {
  color: rgba(255, 255, 255, 0.45);
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.issue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.issue-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateX(2px);
}

.issue-item.is-critical {
  border-left: 3px solid #d03050;
}

.issue-item.is-warning {
  border-left: 3px solid #f0a020;
}

.issue-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 600;
  flex-shrink: 0;
}

.tag-critical {
  background: #d03050;
  color: #fff;
}

.tag-warning {
  background: #f0a020;
  color: #1a1a1a;
}

.issue-location {
  padding: 1px 5px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  flex-shrink: 0;
}

.issue-message {
  flex: 1;
  color: rgba(255, 255, 255, 0.85);
  word-break: break-all;
}

.focus-arrow {
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
  transition: color 0.15s, transform 0.15s;
}

.issue-item:hover .focus-arrow {
  color: #2080f0;
  transform: translateX(2px);
}
</style>
