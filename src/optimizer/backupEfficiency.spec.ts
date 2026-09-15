import {describe,expect,it,vi} from 'vitest'
import {OPERATORS} from '../domain/operators'
import type {OwnedOperatorInput} from '../domain/operatorInventory'
import {createDefaultWorkspace} from '../workbench/defaults'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import {buildBackupSnapshot,optimizeBackupEfficiency} from './backupEfficiency'
import * as projection from './rosterProjection'
import {estimateFixedDuty} from './fixedDuty'

const all:OwnedOperatorInput[]=OPERATORS.map(o=>({operator:o.name,elitePhase:o.rarity<3?0:o.rarity===3?1:2,level:o.rarity<3?30:o.rarity===3?55:o.rarity===4?70:o.rarity===5?80:90}))
const own=(names:string[])=>all.filter(o=>names.includes(o.operator)).map(o=>({...o}))
function fixture(){
 const w=createDefaultWorkspace()
 const mains=['芬','香草','巡林者'],backups=['斑点','月见夜','夜烟']
 w.mainPlan.facilities.room_1_1.slots=mains.map((name,i)=>({occupant:{kind:'operator',operatorId:id(name)},groupId:'main-team',replacements:[id(backups[i]!)]}))
 w.mainPlan.facilities.dormitory_1.slots[0]!.occupant={kind:'free'}
 return w
}
const basic=['芬','香草','巡林者','斑点','月见夜','夜烟']
const backups=(w:ReturnType<typeof fixture>)=>w.mainPlan.facilities.room_1_1.slots.flatMap(s=>s.replacements).map(id)

describe('backup team efficiency screening',()=>{
 it('upgrades a weak full backup team using a real catalog combination without touching mains, groups or Free',()=>{
  const source=fixture(),before=structuredClone(source)
  const result=optimizeBackupEfficiency(source,own([...basic,'泡泡','火神','铅踝']))
  expect(result.beforeScore).not.toBeNull()
  expect(result.afterScore).toBeGreaterThan(result.beforeScore!)
  expect(result.changes.some(c=>c.kind==='combination'&&c.after.includes(id('火神')))).toBe(true)
  expect(new Set(backups(result.workspace))).toEqual(new Set(['泡泡','火神','铅踝'].map(id)))
  for(const [index,s]of result.workspace.mainPlan.facilities.room_1_1.slots.entries())expect({...s,replacements:[]}).toEqual({...before.mainPlan.facilities.room_1_1.slots[index],replacements:[]})
  expect(source).toEqual(before)
  expect(result.workspace.mainPlan.facilities.dormitory_1).toEqual(before.mainPlan.facilities.dormitory_1)
 })
 it('embeds a high-efficiency duo in a three-seat room while retaining a real third backup',()=>{
  const source=fixture()
  source.mainPlan.facilities.room_1_1.type='trading';source.mainPlan.facilities.room_1_1.product='money'
  const before=structuredClone(source)
  const result=optimizeBackupEfficiency(source,own([...basic,'蕾缪安','能天使']))
  expect(result.changes.some(c=>c.kind==='combination'&&c.after.length===2&&c.after.includes(id('蕾缪安'))&&c.after.includes(id('能天使')))).toBe(true)
  const chosen=backups(result.workspace)
  expect(chosen).toHaveLength(3);expect(new Set(chosen).size).toBe(3)
  expect(chosen).toEqual(expect.arrayContaining(['蕾缪安','能天使'].map(id)))
  expect(chosen.some(person=>['斑点','月见夜','夜烟'].map(id).includes(person))).toBe(true)
  expect(result.afterScore).toBeGreaterThan(result.beforeScore!)
  expect(source).toEqual(before)
 })
 it('uses only actual backup occupants and fixed auxiliaries, not off-duty main support or imagined dorm people',()=>{
  const w=fixture()
  w.mainPlan.facilities.central.slots[0]={occupant:{kind:'operator',operatorId:id('Mon3tr')},groupId:null,replacements:[id('阿米娅')]}
  w.mainPlan.facilities.meeting.slots[0]!.occupant={kind:'operator',operatorId:id('虎狼丸')}
  const snapshot=buildBackupSnapshot(w)
  const present=Object.values(snapshot.mainPlan.facilities).flatMap(r=>r.slots.flatMap(s=>s.occupant.kind==='operator'?[s.occupant.operatorId]:[]))
  expect(present).toContain(id('虎狼丸'));expect(present).toContain(id('阿米娅'))
  expect(present).not.toContain(id('Mon3tr'));expect(present).not.toContain(id('芬'))
  expect(snapshot.mainPlan.facilities.dormitory_1.slots[0]!.occupant).toEqual({kind:'free'})
  expect(Object.values(snapshot.mainPlan.facilities).every(r=>r.slots.every(s=>s.replacements.length===0))).toBe(true)
 })
 it('does not install a cross-room template whose named support is absent from the backup snapshot',()=>{
  const w=fixture()
  const inventory=own([...basic,'结城理','砾','阿罗玛','埃癸斯','岳羽由加莉','虎狼丸'])
  const result=optimizeBackupEfficiency(w,inventory)
  expect(result.changes.filter(c=>c.kind==='combination').some(c=>c.after.includes(id('结城理')))).toBe(false)
  expect(result.workspace.mainPlan.facilities.train).toEqual(w.mainPlan.facilities.train)
  expect(result.workspace.mainPlan.facilities.meeting).toEqual(w.mainPlan.facilities.meeting)
 })
 it('accepts a complete cross-room template only with every named support physically present',()=>{
  const w=fixture()
  w.mainPlan.facilities.room_1_3.slots[0]!.occupant={kind:'operator',operatorId:id('埃癸斯')}
  w.mainPlan.facilities.train.slots[0]!.occupant={kind:'operator',operatorId:id('岳羽由加莉')}
  w.mainPlan.facilities.meeting.slots[0]!.occupant={kind:'operator',operatorId:id('虎狼丸')}
  const result=optimizeBackupEfficiency(w,own([...basic,'结城理','砾','阿罗玛','埃癸斯','岳羽由加莉','虎狼丸']))
  expect(result.changes.some(c=>c.kind==='combination'&&c.after.includes(id('结城理')))).toBe(true)
  expect(result.afterScore).toBeGreaterThan(result.beforeScore!)
  expect(result.workspace.mainPlan.facilities.train).toEqual(w.mainPlan.facilities.train)
 })
 it('reserves every primary even when a high-efficiency template wants that operator',()=>{
  const w=fixture();w.mainPlan.facilities.meeting.slots[0]!.occupant={kind:'operator',operatorId:id('火神')}
  const result=optimizeBackupEfficiency(w,own([...basic,'泡泡','火神','铅踝']))
  expect(backups(result.workspace)).not.toContain(id('火神'))
  expect(result.workspace.mainPlan.facilities.meeting).toEqual(w.mainPlan.facilities.meeting)
 })
 it('rejects conflicts, opaque strategies and unsupported source stages atomically',()=>{
  for(const kind of ['duplicate','primary','metadata','conf','stage','special'] as const){
   const w=fixture(),inventory=own([...basic,'泡泡','火神','铅踝','菲亚梅塔'])
   if(kind==='duplicate')w.mainPlan.facilities.room_1_1.slots[1]!.replacements=[id('斑点')]
   if(kind==='primary')w.mainPlan.facilities.room_1_1.slots[0]!.replacements=[id('芬')]
   if(kind==='metadata')w.mainPlan.facilities.room_1_1.slots[0]!.metadata={custom:true}
   if(kind==='conf')w.mainPlan.conf.workaholic=['芬']
   if(kind==='stage')Object.assign(inventory.find(o=>o.operator==='夜烟')!,{elitePhase:0,level:1})
   if(kind==='special')w.mainPlan.facilities.room_1_1.slots[0]!.replacements=[id('菲亚梅塔')]
   const result=optimizeBackupEfficiency(w,inventory)
   expect(result.workspace).toEqual(w);expect(result.changes).toEqual([]);expect(result.diagnostics.length).toBeGreaterThan(0)
  }
 })
 it('does not borrow locked candidates or treat unknown skills as zero',()=>{
  const w=fixture(),inventory=own([...basic,'泡泡','火神','铅踝'])
  Object.assign(inventory.find(o=>o.operator==='火神')!,{elitePhase:0,level:1})
  const result=optimizeBackupEfficiency(w,inventory)
  expect(backups(result.workspace)).not.toContain(id('火神'))
  const original=projection.projectRosterOutput
  const spy=vi.spyOn(projection,'projectRosterOutput').mockImplementation(snapshot=>{
   const value=original(snapshot)
   if(backupsFromSnapshot(snapshot).includes(id('泡泡')))return {...value,complete:false,diagnostics:['unquantified candidate']}
   return value
  })
  try{expect(backups(optimizeBackupEfficiency(w,own([...basic,'泡泡','火神','铅踝'])).workspace)).not.toContain(id('泡泡'))}finally{spy.mockRestore()}
 })
 it('atomically rebuilds an unknown backup baseline without claiming a numeric baseline gain',()=>{
  const w=fixture(),original=projection.projectRosterOutput
  const spy=vi.spyOn(projection,'projectRosterOutput').mockImplementation(snapshot=>{
   const value=original(snapshot)
   return backupsFromSnapshot(snapshot).includes(id('夜烟'))?{...value,complete:false,diagnostics:['unquantified baseline']}:value
  })
  try{
   const result=optimizeBackupEfficiency(w,own([...basic,'泡泡','火神','铅踝']))
   expect(result.beforeScore).toBeNull();expect(result.afterScore).not.toBeNull()
   expect(backups(result.workspace)).not.toContain(id('夜烟'))
   expect(result.diagnostics.join(' ')).toContain('不宣称')
  }finally{spy.mockRestore()}
 })
 it('returns the original whole roster if rebuilding exceeds its budget',()=>{
  const w=fixture(),original=projection.projectRosterOutput
  const spy=vi.spyOn(projection,'projectRosterOutput').mockImplementation(snapshot=>({...original(snapshot),complete:false,diagnostics:['unknown']}))
  try{
   const result=optimizeBackupEfficiency(w,own([...basic,'泡泡','火神','铅踝']),{maxEvaluations:1})
   expect(result.workspace).toEqual(w);expect(result.afterScore).toBeNull();expect(result.evaluations).toBe(1)
  }finally{spy.mockRestore()}
 })
 it('rejects a backup-only increase that reduces the actual fixed-duty ranking',()=>{
  const w=createDefaultWorkspace()
  w.mainPlan.facilities.room_1_1.slots[0]={occupant:{kind:'operator',operatorId:id('砾')},groupId:'gold-a',replacements:[id('斑点')]}
  w.mainPlan.facilities.room_1_2.slots[0]={occupant:{kind:'operator',operatorId:id('夜烟')},groupId:'locked-support',replacements:[id('芬')]}
  const inventory=own(['砾','斑点','夜烟','芬','阿罗玛']),lockedPositions=['room_1_2:0']
  const baseline=estimateFixedDuty(w)
  const backupOnly=optimizeBackupEfficiency(w,inventory,{maxEvaluations:100,lockedPositions})
  expect(backupOnly.afterScore).toBeGreaterThan(backupOnly.beforeScore!)
  expect(estimateFixedDuty(backupOnly.workspace).rankingScore).toBeCloseTo(baseline.rankingScore!-220)
  const pair=optimizeBackupEfficiency(w,inventory,{maxEvaluations:100,lockedPositions,mainDutyRatio:.775})
  expect(pair.workspace).toEqual(w);expect(pair.changes).toEqual([])
  expect(pair.beforeRanking).toBeCloseTo(baseline.rankingScore!)
  expect(pair.afterRanking).toBeCloseTo(baseline.rankingScore!)
 })
 it('accepts a lower backup score when removing undefined duty improves the paired objective',()=>{
  const w=createDefaultWorkspace()
  w.mainPlan.facilities.room_1_1.slots[0]={occupant:{kind:'operator',operatorId:id('砾')},groupId:'gold-a',replacements:[id('阿罗玛')]}
  w.mainPlan.facilities.room_1_2.slots[0]={occupant:{kind:'operator',operatorId:id('夜烟')},groupId:'locked-support',replacements:[id('芬')]}
  const before=structuredClone(w)
  const result=optimizeBackupEfficiency(w,own(['砾','斑点','夜烟','芬','阿罗玛']),{maxEvaluations:100,lockedPositions:['room_1_2:0'],mainDutyRatio:.775})
  expect(result.afterScore).toBeLessThan(result.beforeScore!)
  expect(result.afterRanking!-result.beforeRanking!).toBeCloseTo(220)
  expect(result.afterRanking).toBeCloseTo(estimateFixedDuty(result.workspace).rankingScore!)
  expect(result.workspace.mainPlan.facilities.room_1_1.slots[0]!.replacements).toEqual([id('斑点')])
  expect(result.workspace.mainPlan.facilities.room_1_2).toEqual(before.mainPlan.facilities.room_1_2)
  expect(w).toEqual(before)
 })
 it('counts the fixed main projection once and every backup projection within the paired budget',()=>{
  const w=fixture(),inventory=own([...basic,'泡泡','火神','铅踝'])
  const spy=vi.spyOn(projection,'projectRosterOutput')
  try{
   for(const maxEvaluations of [1,2,8,30]){
    spy.mockClear()
    const result=optimizeBackupEfficiency(w,inventory,{maxEvaluations,mainDutyRatio:.775})
    expect(result.evaluations).toBe(spy.mock.calls.length)
    expect(result.evaluations).toBeLessThanOrEqual(maxEvaluations)
    if(result.beforeRanking!==null)expect(result.afterRanking).toBeGreaterThanOrEqual(result.beforeRanking)
   }
  }finally{spy.mockRestore()}
  for(const mainDutyRatio of [.74,.81,NaN,Infinity]){
   const result=optimizeBackupEfficiency(w,inventory,{mainDutyRatio})
   expect(result.workspace).toEqual(w);expect(result.evaluations).toBe(0)
  }
 })
 it('retains the original roster when the fixed main is unknown in paired mode',()=>{
  const w=fixture(),original=projection.projectRosterOutput
  const unknown=vi.spyOn(projection,'projectRosterOutput').mockImplementation(snapshot=>({...original(snapshot),complete:false,diagnostics:['unknown main']}))
  try{
   const result=optimizeBackupEfficiency(w,own([...basic,'泡泡','火神','铅踝']),{mainDutyRatio:.775})
   expect(result.workspace).toEqual(w);expect(result.beforeRanking).toBeNull();expect(result.afterRanking).toBeNull();expect(result.evaluations).toBe(2)
  }finally{unknown.mockRestore()}
 })
 it('keeps scores nondecreasing and honors deterministic finite evaluation budgets',()=>{
  const w=fixture(),inventory=own([...basic,'泡泡','火神','铅踝'])
  for(const maxEvaluations of [1,2,12,100]){
   const a=optimizeBackupEfficiency(w,inventory,{maxEvaluations}),b=optimizeBackupEfficiency(w,inventory,{maxEvaluations})
   expect(a).toEqual(b);expect(a.evaluations).toBeLessThanOrEqual(maxEvaluations);expect(a.afterScore).toBeGreaterThanOrEqual(a.beforeScore!)
  }
 })
})
function backupsFromSnapshot(w:ReturnType<typeof fixture>){return w.mainPlan.facilities.room_1_1.slots.flatMap(s=>s.occupant.kind==='operator'?[id(s.occupant.operatorId)]:[])}
