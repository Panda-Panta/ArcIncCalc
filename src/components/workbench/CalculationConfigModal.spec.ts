// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CalculationConfigModal from './CalculationConfigModal.vue'
import { createDefaultWorkspace } from '../../workbench/defaults'

afterEach(() => { document.body.innerHTML = '' })
it('restores the saved target and drops a stale trading room when switching targets', async () => {
  const wrapper = mount(CalculationConfigModal, {
    props: { open: true, workspace: createDefaultWorkspace(), initial: { droneTarget: 'trading', droneTradingRoomId: 'room_3_2' } },
    global: { stubs: { teleport: true } },
  })
  try {
    expect(wrapper.get<HTMLSelectElement>('[data-test="calculation-drone-target"]').element.value).toBe('trading')
    expect(wrapper.get<HTMLSelectElement>('[data-test="calculation-trading-room"]').element.value).toBe('room_3_2')
    await wrapper.get('[data-test="calculation-drone-target"]').setValue('none')
    await wrapper.get('[data-test="confirm-calculation"]').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([{ droneTarget: 'none', droneTradingRoomId: '' }])
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true, initial: { droneTarget: 'trading', droneTradingRoomId: 'room_1_3' } })
    expect(wrapper.get<HTMLSelectElement>('[data-test="calculation-trading-room"]').element.value).toBe('')
  } finally { wrapper.unmount() }
})
