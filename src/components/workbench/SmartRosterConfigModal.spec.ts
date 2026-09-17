/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SmartRosterConfigModal, {
  DEFAULT_CONFIG,
  STORAGE_KEY_SMART_ROSTER,
  type SmartRosterConfig,
} from './SmartRosterConfigModal.vue'

describe('SmartRosterConfigModal.vue', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  function mountModal(props: Record<string, unknown> = {}) {
    return mount(SmartRosterConfigModal, {
      props: {
        open: true,
        ...props,
      },
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true,
          Teleport: true,
        },
      },
    })
  }

  it('renders modal content when open is true', () => {
    const wrapper = mountModal({ open: true })

    expect(wrapper.find('[data-test="smart-roster-modal-body"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="trials-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="max-evals-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="topk-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="sample-hours-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="enable-deep-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="drone-target-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="seed-input"]').exists()).toBe(true)
  })

  it('does not render body when open is false', () => {
    const wrapper = mountModal({ open: false })

    expect(wrapper.find('[data-test="smart-roster-modal-body"]').exists()).toBe(false)
  })

  it('initializes with default config and props', () => {
    const wrapper = mountModal({
      open: true,
      initialDroneTarget: 'exp',
      initialSeed: 12345,
    })

    const trialsInput = wrapper.find<HTMLInputElement>('[data-test="trials-input"]')
    expect(Number(trialsInput.element.value)).toBe(DEFAULT_CONFIG.trials)

    const droneSelect = wrapper.find<HTMLSelectElement>('[data-test="drone-target-select"]')
    expect(droneSelect.element.value).toBe('exp')

    const seedInput = wrapper.find<HTMLInputElement>('[data-test="seed-input"]')
    expect(Number(seedInput.element.value)).toBe(12345)
  })

  it('emits confirm with modified parameters and persists to localStorage', async () => {
    const wrapper = mountModal({ open: true })

    await wrapper.find<HTMLInputElement>('[data-test="trials-input"]').setValue(8)
    await wrapper.find<HTMLInputElement>('[data-test="max-evals-input"]').setValue(5000)
    await wrapper.find<HTMLInputElement>('[data-test="topk-input"]').setValue(4)
    await wrapper.find<HTMLInputElement>('[data-test="sample-hours-input"]').setValue(48)
    await wrapper.find<HTMLInputElement>('[data-test="enable-deep-search"]').setValue(false)
    await wrapper.find<HTMLSelectElement>('[data-test="drone-target-select"]').setValue('trading')
    await wrapper.find<HTMLInputElement>('[data-test="seed-input"]').setValue(99999)

    await wrapper.find('[data-test="confirm-btn"]').trigger('click')

    expect(wrapper.emitted('confirm')).toBeTruthy()
    const emittedConfig = wrapper.emitted('confirm')![0]![0] as SmartRosterConfig
    expect(emittedConfig).toEqual({
      trials: 8,
      maxStaticEvals: 5000,
      simulationTopK: 4,
      simulationSampleHours: 48,
      simulationWarmupHours: 24,
      enableDeepSearch: false,
      droneTarget: 'trading',
      seed: 99999,
    })

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_SMART_ROSTER) || '{}')
    expect(stored.trials).toBe(8)
    expect(stored.simulationSampleHours).toBe(48)
    expect(stored.enableDeepSearch).toBe(false)
  })

  it('resets form when reset button is clicked', async () => {
    const customConfig: SmartRosterConfig = {
      trials: 2,
      maxStaticEvals: 1000,
      simulationTopK: 2,
      simulationSampleHours: 24,
      simulationWarmupHours: 12,
      enableDeepSearch: false,
      droneTarget: 'exp',
      seed: 888,
    }
    localStorage.setItem(STORAGE_KEY_SMART_ROSTER, JSON.stringify(customConfig))

    const wrapper = mountModal({
      open: true,
      initialDroneTarget: 'gold',
      initialSeed: -1,
    })

    expect(wrapper.find<HTMLInputElement>('[data-test="trials-input"]').element.value).toBe('2')

    await wrapper.find('[data-test="reset-btn"]').trigger('click')

    expect(wrapper.find<HTMLInputElement>('[data-test="trials-input"]').element.value).toBe(String(DEFAULT_CONFIG.trials))
    expect(wrapper.find<HTMLInputElement>('[data-test="seed-input"]').element.value).toBe('-1')
    expect(localStorage.getItem(STORAGE_KEY_SMART_ROSTER)).toBeNull()
  })

  it('emits close when cancel button is clicked', async () => {
    const wrapper = mountModal({ open: true })

    await wrapper.find('[data-test="cancel-btn"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
