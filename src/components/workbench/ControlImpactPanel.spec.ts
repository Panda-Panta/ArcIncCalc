/** @vitest-environment jsdom */
import {describe,it,expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {createDefaultWorkspace} from '../../workbench/defaults'
import {resolveOperatorCharId as id} from '../../workbench/compat/mowerJson'
import ControlImpactPanel from './ControlImpactPanel.vue'
function setup(){
 const workspace=createDefaultWorkspace()
 workspace.mainPlan.facilities.central.slots[0]!.occupant={kind:'operator',operatorId:id('阿米娅')}
 workspace.mainPlan.facilities.room_3_1.level=1;workspace.mainPlan.facilities.room_3_1.slots=[]
 workspace.mainPlan.facilities.room_3_2.level=1;workspace.mainPlan.facilities.room_3_2.slots=[]
 return {workspace,inventory:{enabled:false,valid:true,entries:[]}}
}
describe('control configuration UI',()=>{
 it('shows hand-calculated marginal output and compares a replacement without changing the roster',async()=>{
  const props=setup(),before=JSON.stringify(props.workspace),w=mount(ControlImpactPanel,{props})
  await w.get('[data-test=analyze-control]').trigger('click')
  expect(w.find('[role=alert]').exists()).toBe(false)
  expect(w.get('tbody').text()).toContain('+280');expect(w.get('tbody').text()).toContain('+1,400')
  await w.get('[data-test=control-alternative]').setValue('诗怀雅');await w.get('[data-test=compare-control]').trigger('click')
  expect(w.get('[data-test=control-comparison]').text()).toContain('综合值 0 / 日')
  expect(JSON.stringify(props.workspace)).toBe(before)
  await w.setProps({workspace:{...props.workspace,name:'new'}})
  expect(w.find('[data-test=control-baseline]').exists()).toBe(false);w.unmount()
 })
 it('rejects invalid inventory and unavailable comparison members',async()=>{
  const p=setup(),w=mount(ControlImpactPanel,{props:p})
  await w.setProps({inventory:{enabled:true,valid:false,entries:[]}})
  await w.get('[data-test=analyze-control]').trigger('click');expect(w.get('[role=alert]').text()).toContain('无效条目')
  await w.setProps({inventory:{enabled:true,valid:true,entries:[{operator:'阿米娅',elitePhase:2,level:80}]}})
  await w.get('[data-test=analyze-control]').trigger('click')
  await w.get('[data-test=control-alternative]').setValue('凯尔希');await w.get('[data-test=compare-control]').trigger('click')
  expect(w.get('[role=alert]').text()).toContain('已录入干员库');expect(w.find('[data-test=control-comparison]').exists()).toBe(false);w.unmount()
 })
 it('rejects duplicate names and clears comparison after editing the alternative',async()=>{
  const w=mount(ControlImpactPanel,{props:setup()});await w.get('[data-test=analyze-control]').trigger('click')
  await w.get('[data-test=control-alternative]').setValue('阿米娅，阿米娅');await w.get('[data-test=compare-control]').trigger('click')
  expect(w.get('[role=alert]').text()).toContain('重复')
  await w.get('[data-test=control-alternative]').setValue('');await w.get('[data-test=compare-control]').trigger('click')
  expect(w.get('[data-test=control-comparison]').text()).toContain('-280')
  await w.get('[data-test=control-alternative]').setValue('诗怀雅');expect(w.find('[data-test=control-comparison]').exists()).toBe(false);w.unmount()
 })
})
