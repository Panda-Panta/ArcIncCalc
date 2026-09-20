import { describe, it, expect } from 'vitest'
import { createDefaultWorkspace } from '../workbench/defaults'
import { compileRosterSchedule } from '../scheduler/compileRosterSchedule'
import { resolveOperatorCharId as id } from '../workbench/compat/mowerJson'
import { simulateSchedule } from './scheduleSimulation'

function fixture(level = 1, runners = ['但书']) {
 const ws = createDefaultWorkspace()
 for (const key of ['room_3_1', 'room_3_2'] as const) {
  const r = ws.mainPlan.facilities[key];r.level = level
  r.slots = Array.from({length:level},(_,i)=>({occupant:{kind:'operator' as const,operatorId:id((key==='room_3_1'?['芬','砾','香草']:['克洛丝','斑点','空爆'])[i]!)},groupId:null,replacements:i<runners.length?[id(runners[i]!)]:[]}))
 }
 const schedule = compileRosterSchedule(ws)
 schedule.rooms = schedule.rooms.filter(r=>r.type==='trading');schedule.restPools=[]
 return schedule
}
const options = {sampleHours:8,recordSegments:true,consumptionOverrides:Object.fromEntries(['芬','砾','香草','克洛丝','斑点','空爆'].map(n=>[id(n),0])),production:{outputMode:'potential' as const,droneTarget:'none' as const,seed:42}}
describe('ideal run-order product contract',()=>{
 it('defaults to instantaneous conversion, with no worker occupancy or waiting loss',()=>{
  const schedule=fixture(),normal=fixture(1,[])
  const actual=simulateSchedule(schedule,options),baseline=simulateSchedule(normal,options)
  expect(actual.production!.assumptions.runOrderMode).toBe('ideal')
  const done=(r:typeof actual)=>r.production!.events.filter(e=>e.type==='order-completed')
  expect(done(actual).map(e=>[e.roomId,e.time])).toEqual(done(baseline).map(e=>[e.roomId,e.time]))
  expect(done(actual).every(e=>e.order!.kind==='proviso')).toBe(true)
  expect(actual.production!.events.filter(e=>e.type==='run-order-ideal')).toHaveLength(done(actual).length)
  expect(actual.production!.events.some(e=>['run-order-missed','run-order-skipped','run-order-inserted'].includes(e.type))).toBe(false)
  expect(actual.segments.every(s=>!Object.values(s.occupants).includes(id('但书')))).toBe(true)
  expect(actual.operators.find(o=>o.operatorId===id('但书'))?.workHours??0).toBe(0)
 })
 it('converts two simultaneously finishing stations using the same runner even if occupied elsewhere',()=>{
  const schedule=fixture()
  // Equal ordinary staffing efficiencies force an identical completion instant.
  // Use disjoint ordinary workers with identical base efficiencies instead.
  for(const [i,n] of ['Lancet-2','Castle-3'].entries()) {
   schedule.rooms[i]!.slots[0]!.primaryOperatorId=id(n)
   schedule.rooms[i]!.slots[0]!.occupant={kind:'operator',operatorId:id(n)}
  }
  const factory=compileRosterSchedule(createDefaultWorkspace()).rooms.find(r=>r.type==='factory')!
  factory.slots[0]!.primaryOperatorId=id('但书');factory.slots[0]!.occupant={kind:'operator',operatorId:id('但书')}
  schedule.rooms.push(factory)
  schedule.assumptions.operatorMorale[id('但书')]=0
  const result=simulateSchedule(schedule,{...options,sampleHours:3})
  const done=result.production!.events.filter(e=>e.type==='order-completed')
  expect(done).toHaveLength(2)
  expect(done[0]!.time).toBeCloseTo(done[1]!.time,10)
  expect(done.every(e=>e.order!.kind==='proviso')).toBe(true)
  expect(result.production!.success).toBe(true)
 })
 it('does not consume Free beds or add virtual dormitory residents',()=>{
  const schedule=fixture(),base=fixture(1,[]),w=createDefaultWorkspace()
  w.mainPlan.facilities.dormitory_1.slots=[{occupant:{kind:'free'},groupId:null,replacements:[]}]
  const compiled=compileRosterSchedule(w),room=compiled.rooms.find(r=>r.roomId==='dormitory_1')!,pool=compiled.restPools.find(r=>r.roomId==='dormitory_1')!
  for(const s of [schedule,base]){s.rooms.push(room);s.restPools=[pool]}
  const actual=simulateSchedule(schedule,options),normal=simulateSchedule(base,options)
  expect(actual.operators.some(o=>o.operatorId===id('但书'))).toBe(false)
  expect(actual.segments.map(s=>s.bedOccupants)).toEqual(normal.segments.map(s=>s.bedOccupants))
 })
 it('converts base four-gold orders with Tequila and never stacks Proviso on them',()=>{
  const result=simulateSchedule(fixture(3,['但书','龙舌兰']),{...options,sampleHours:24})
  const orders=result.production!.events.filter(e=>e.type==='order-completed').map(e=>e.order!)
  expect(orders.some(o=>o.kind==='tequila')).toBe(true)
  expect(orders.every(o=>o.kind==='tequila'?o.goldCost===4&&o.lmdReward===2500:o.kind==='proviso'&&((o.goldCost===4&&o.lmdReward===2000)||(o.goldCost===5&&o.lmdReward===2500)))).toBe(true)
 })
})
