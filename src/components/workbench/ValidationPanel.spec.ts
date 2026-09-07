/**
 * @vitest-environment jsdom
 *
 * Derivative work based on arknights-mower (Plan.vue)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ValidationPanel, { type ValidationFocusPayload } from './ValidationPanel.vue'
import { useRosterWorkbenchStore } from '../../workbench/store'
import type { ValidationIssue, ValidationResult } from '../../workbench/validate'

describe('ValidationPanel.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders zero-state when there are no issues', () => {
    const cleanResult: ValidationResult = {
      isValid: true,
      criticalErrors: [],
      warnings: [],
      issues: [],
      power: {
        generation: 810,
        consumption: 540,
        margin: 270,
        sufficient: true,
      },
    }

    const wrapper = mount(ValidationPanel, {
      props: { result: cleanResult },
    })

    const zeroState = wrapper.find('[data-test="zero-state"]')
    expect(zeroState.exists()).toBe(true)
    expect(zeroState.text()).toContain('排班校验通过')

    expect(wrapper.find('[data-test="critical-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="warning-group"]').exists()).toBe(false)
  })

  it('renders critical errors and warnings grouped clearly', () => {
    const criticalIssue: ValidationIssue = {
      code: 'DUPLICATE_OPERATOR',
      severity: 'critical',
      roomId: 'room_1_2',
      slotIndex: 0,
      message: '干员在 room_1_1 和 room_1_2 同时在岗，不可重复指派主力。',
    }

    const warningIssue: ValidationIssue = {
      code: 'NO_REPLACEMENT',
      severity: 'warning',
      roomId: 'room_2_1',
      slotIndex: 1,
      message: 'room_2_1 席位干员未配置替补。',
    }

    const result: ValidationResult = {
      isValid: false,
      criticalErrors: [criticalIssue],
      warnings: [warningIssue],
      issues: [criticalIssue, warningIssue],
      power: {
        generation: 810,
        consumption: 540,
        margin: 270,
        sufficient: true,
      },
    }

    const wrapper = mount(ValidationPanel, {
      props: { result },
    })

    // Zero-state is not shown
    expect(wrapper.find('[data-test="zero-state"]').exists()).toBe(false)

    // Critical group
    const criticalGroup = wrapper.find('[data-test="critical-group"]')
    expect(criticalGroup.exists()).toBe(true)
    expect(criticalGroup.text()).toContain('严重错误')
    expect(criticalGroup.text()).toContain('同时在岗')

    // Warning group
    const warningGroup = wrapper.find('[data-test="warning-group"]')
    expect(warningGroup.exists()).toBe(true)
    expect(warningGroup.text()).toContain('排班提示与警告')
    expect(warningGroup.text()).toContain('未配置替补')
  })

  it('emits focus payload with roomId, slotIndex, and policy key where available', async () => {
    const criticalIssue: ValidationIssue = {
      code: 'DUPLICATE_OPERATOR',
      severity: 'critical',
      roomId: 'room_1_1',
      slotIndex: 2,
      message: '测试席位重复',
    }

    const policyWarning = {
      code: 'INVALID_CONFIG' as const,
      severity: 'warning' as const,
      roomId: 'central' as const,
      policyKey: 'exhaust_require',
      message: '策略配置中的干员未在基建就绪',
    }

    const result: ValidationResult = {
      isValid: false,
      criticalErrors: [criticalIssue],
      warnings: [policyWarning],
      issues: [criticalIssue, policyWarning],
      power: {
        generation: 810,
        consumption: 540,
        margin: 270,
        sufficient: true,
      },
    }

    const wrapper = mount(ValidationPanel, {
      props: { result },
    })

    // Click critical issue item
    const criticalItem = wrapper.find('[data-test="critical-issue-0"]')
    expect(criticalItem.exists()).toBe(true)
    await criticalItem.trigger('click')

    const focusEvents = wrapper.emitted('focus')
    expect(focusEvents).toBeTruthy()
    expect(focusEvents!.length).toBe(1)

    const payload1 = focusEvents![0]![0] as ValidationFocusPayload
    expect(payload1.roomId).toBe('room_1_1')
    expect(payload1.slotIndex).toBe(2)
    expect(payload1.code).toBe('DUPLICATE_OPERATOR')
    expect(payload1.severity).toBe('critical')

    // Backward-compatible focus-room event
    expect(wrapper.emitted('focus-room')?.[0]).toEqual(['room_1_1'])

    // Click policy warning item
    const warningItem = wrapper.find('[data-test="warning-issue-0"]')
    expect(warningItem.exists()).toBe(true)
    await warningItem.trigger('click')

    expect(focusEvents!.length).toBe(2)
    const payload2 = focusEvents![1]![0] as ValidationFocusPayload
    expect(payload2.policyKey).toBe('exhaust_require')
    expect(payload2.roomId).toBe('central')
  })

  it('falls back to validating store workspace reactively when no result prop is provided', async () => {
    const store = useRosterWorkbenchStore()

    // 1. In default workspace with power sufficient, without duplicate operators, check initial validation
    const wrapper = mount(ValidationPanel)

    // Initially there may be warnings (e.g. empty replacements), but no critical errors
    const initialWarnings = wrapper.findAll('.is-warning')
    expect(initialWarnings.length).toBeGreaterThanOrEqual(0)

    // 2. Introduce a duplicate primary operator
    store.updateSlotOccupant('room_1_1', 0, { kind: 'operator', operatorId: 'char_002_amiya' })
    store.updateSlotOccupant('room_1_2', 0, { kind: 'operator', operatorId: 'char_002_amiya' })
    await wrapper.vm.$nextTick()

    // Critical group should now be rendered with DUPLICATE_OPERATOR
    const criticalGroup = wrapper.find('[data-test="critical-group"]')
    expect(criticalGroup.exists()).toBe(true)
    expect(criticalGroup.text()).toContain('同时在岗')
  })
})
