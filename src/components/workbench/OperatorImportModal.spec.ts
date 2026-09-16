/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorImportModal from './OperatorImportModal.vue'

describe('OperatorImportModal.vue', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function mountModal(props: Record<string, unknown> = {}) {
    return mount(OperatorImportModal, {
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

  it('renders modal when open is true', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.operator-import-modal').exists()).toBe(true)
    expect(wrapper.find('.file-dropzone').exists()).toBe(true)
  })

  it('parses pasted MAA CSV text and emits imported on confirm', async () => {
    const wrapper = mountModal()

    const vm = wrapper.vm as any
    vm.activeTab = 'maa'
    vm.maaText = '干员,ID,星级,精英化等级,等级,是否拥有,潜能\n能天使,char_103_angel,6,2,90,是,2\n耀骑士临光,char_1014_nearl2,6,0,0,否,0'
    await wrapper.vm.$nextTick()

    // Recognition panel should be visible
    expect(wrapper.find('.recognition-panel').exists()).toBe(true)
    expect(wrapper.find('.rec-stat').text()).toContain('1')

    // Click confirm
    vm.handleImport()

    const emitted = wrapper.emitted('imported')
    expect(emitted).toBeDefined()
    expect(emitted![0]![0]).toEqual([{ operator: '能天使', elitePhase: 2, level: 90 }])
    expect(emitted![0]![1]).toBe('能天使,2,90')
  })

  it('supports merge mode preserving previous localStorage operators', async () => {
    localStorage.setItem(
      'arcinc-operator-inventory-v1',
      JSON.stringify({
        schemaVersion: 1,
        text: '德克萨斯,2,80',
        enabled: true,
      })
    )

    const wrapper = mountModal()

    const vm = wrapper.vm as any
    vm.activeTab = 'maa'
    vm.importMode = 'merge'
    vm.maaText = '干员,ID,星级,精英化等级,等级,是否拥有,潜能\n能天使,char_103_angel,6,2,90,是,2'
    await wrapper.vm.$nextTick()

    vm.handleImport()

    const emitted = wrapper.emitted('imported')
    expect(emitted).toBeDefined()
    const importedEntries = emitted![0]![0] as any[]
    expect(importedEntries).toHaveLength(2)
    expect(importedEntries.some(e => e.operator === '德克萨斯')).toBe(true)
    expect(importedEntries.some(e => e.operator === '能天使')).toBe(true)
  })
})
