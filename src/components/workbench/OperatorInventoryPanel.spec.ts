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
