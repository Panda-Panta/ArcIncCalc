/** @vitest-environment jsdom */
import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount} from '@vue/test-utils'
import OperatorInventoryPanel from './OperatorInventoryPanel.vue'
afterEach(()=>{vi.restoreAllMocks();localStorage.clear()})
describe('operator inventory controls',()=>{
 it('requires explicit stages, displays locked skills and emits a disabled inventory by default',async()=>{
  const w=mount(OperatorInventoryPanel)
  expect(w.emitted('change')?.[0]?.[0]).toEqual({enabled:false,valid:true,entries:[]})
  await w.get('[data-test=inventory-enabled]').setValue(true)
  await w.get('textarea').setValue('温蒂,0,1\n清流,1,1')
  expect(w.text()).toContain('2 名干员')
  expect(w.text()).toContain('（与最高技能模型不同）')
  expect(w.text()).toContain('自动化·β')
  expect(w.emitted('change')?.slice(-1)[0]?.[0]).toMatchObject({enabled:true,valid:true,entries:[{operator:'温蒂',elitePhase:0,level:1},{operator:'清流',elitePhase:1,level:1}]})
  await w.get('textarea').setValue('温蒂')
  expect(w.text()).toContain('第 1 行')
  expect(w.emitted('change')?.slice(-1)[0]?.[0]).toMatchObject({valid:false})
  w.unmount()
 })
 it('retains entered inventory across remounts without marking all operators owned',async()=>{
  const w=mount(OperatorInventoryPanel)
  await w.get('[data-test=inventory-enabled]').setValue(true)
  await w.get('textarea').setValue('Lancet-2,0,30')
  w.unmount()
  const restored=mount(OperatorInventoryPanel)
  expect(restored.get('textarea').element).toHaveProperty('value','Lancet-2,0,30')
  expect(restored.emitted('change')?.[0]?.[0]).toMatchObject({enabled:true,entries:[{operator:'Lancet-2',elitePhase:0,level:30}]})
  restored.unmount()
 })

 it('retains a corrupt stored record until the user edits and tolerates quota failures',async()=>{
  localStorage.setItem('arcinc-operator-inventory-v1','corrupt')
  const w=mount(OperatorInventoryPanel)
  expect(w.text()).toContain('无法读取')
  expect(localStorage.getItem('arcinc-operator-inventory-v1')).toBe('corrupt')
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota')})
  await w.get('textarea').setValue('砾,1,1')
  expect(w.text()).toContain('本地保存失败')
  expect(w.emitted('change')?.slice(-1)[0]?.[0]).toMatchObject({valid:true,entries:[{operator:'砾',elitePhase:1,level:1}]})
  w.unmount()
 })

  it('opens import modal when clicking import button', async () => {
    const w = mount(OperatorInventoryPanel, {
      global: {
        stubs: {
          teleport: true,
          Teleport: true,
        },
      },
    })
    const vm = w.vm as any
    expect(vm.importModalOpen).toBe(false)
    await w.get('[data-test="open-import-modal-btn"]').trigger('click')
    expect(vm.importModalOpen).toBe(true)
    w.unmount()
  })

  it('renders operator table with avatar, name, elite badge, and level, and supports search filtering', async () => {
    const w = mount(OperatorInventoryPanel)
    await w.get('textarea').setValue('温蒂,2,80\n清流,1,55\nLancet-2,0,30')

    const tableView = w.find('[data-test="inventory-table-view"]')
    expect(tableView.exists()).toBe(true)

    const rows = w.findAll('[data-test="inventory-op-row"]')
    expect(rows).toHaveLength(3)

    // Check columns of first row
    const firstRow = rows[0]!
    expect(firstRow.text()).toContain('温蒂')
    expect(firstRow.text()).toContain('精 2')
    expect(firstRow.text()).toContain('Lv.80')
    const img = firstRow.find('img.op-table-avatar')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toContain('%E6%B8%A9%E8%92%82')

    // Test search filter
    await w.get('[data-test="inventory-search-input"]').setValue('清流')
    const filteredRows = w.findAll('[data-test="inventory-op-row"]')
    expect(filteredRows).toHaveLength(1)
    expect(filteredRows[0]!.text()).toContain('清流')

    // Toggle to text mode
    await w.get('[data-test="view-mode-text-btn"]').trigger('click')
    expect(w.vm.viewMode).toBe('text')
    w.unmount()
  })

  it('clears inventory when clear button is clicked with confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = mount(OperatorInventoryPanel)
    await w.get('[data-test=inventory-enabled]').setValue(true)
    await w.get('textarea').setValue('温蒂,2,80')

    expect(localStorage.getItem('arcinc-operator-inventory-v1')).toContain('温蒂')

    const clearBtn = w.get('[data-test="clear-inventory-btn"]')
    expect(clearBtn.attributes('disabled')).toBeUndefined()
    await clearBtn.trigger('click')

    expect(w.vm.text).toBe('')
    expect(w.vm.enabled).toBe(false)
    expect(localStorage.getItem('arcinc-operator-inventory-v1')).toBeNull()
    expect(w.emitted('change')?.slice(-1)[0]?.[0]).toMatchObject({ enabled: false, entries: [] })
    w.unmount()
  })

  it('syncs inventory across components when arcinc-inventory-synced is dispatched', async () => {
    const w = mount(OperatorInventoryPanel)
    window.dispatchEvent(new CustomEvent('arcinc-inventory-synced', {
      detail: { text: '砾,1,1', enabled: true },
    }))
    await w.vm.$nextTick()

    expect(w.vm.text).toBe('砾,1,1')
    expect(w.vm.enabled).toBe(true)
    expect(w.text()).toContain('1 名干员')
    w.unmount()
  })
})
