import {describe,it,expect} from 'vitest'
import {createDefaultWorkspace} from '../workbench/defaults'
import {estimateFixedDuty,hasConsumptionSkill,combineDutySnapshots} from './fixedDuty'
import {projectRosterOutput} from './rosterProjection'
import {buildBackupSnapshot} from './backupSnapshot'
function fixture(){const w=createDefaultWorkspace();w.mainPlan.facilities.room_1_1.slots[0]={occupant:{kind:'operator',operatorId:'砾'},groupId:null,replacements:['斑点']};return w}
describe('fixed duty efficiency references',()=>{
 it('applies user ratio only to ordinary staff using 82 output snapshots',()=>{
  const w=fixture(),before=structuredClone(w),r=estimateFixedDuty(w)
  expect(r.complete).toBe(true);expect(r.specialOperators).toEqual([])
  expect(r.weightedScore).toBeCloseTo(r.mainScore*.775+r.backupScore*.225)
  expect(r.rankingScore).toBeCloseTo(r.weightedScore!)
  expect(w).toEqual(before)
 })
 it('reuses already projected snapshots with the same conditional ranking',()=>{
  const w=fixture();w.mainPlan.facilities.room_1_1.slots[0]!.replacements=['阿罗玛']
  const combined=combineDutySnapshots(w,projectRosterOutput(w),projectRosterOutput(buildBackupSnapshot(w)),.8)
  expect(combined).toEqual(estimateFixedDuty(w,.8))
 })
 it('accepts both boundaries and adjusts ordinary weighted scores continuously',()=>{
  const low=estimateFixedDuty(fixture(),.75),high=estimateFixedDuty(fixture(),.8)
  expect(high.weightedScore!-low.weightedScore!).toBeCloseTo((low.mainScore-low.backupScore)*.05)
  for(const value of [.74,.81,NaN,Infinity])expect(()=>estimateFixedDuty(fixture(),value)).toThrow()
 })
 it('leaves consumption-skilled workers ratios undefined instead of giving them 77.5%',()=>{
  const w=fixture();w.mainPlan.facilities.room_1_1.slots[0]!.occupant={kind:'operator',operatorId:'阿罗玛'}
  const r=estimateFixedDuty(w),row=r.rows.find(row=>row.roomId==='room_1_1')!
  expect(hasConsumptionSkill('阿罗玛')).toBe(true)
  expect(row.ratio).toBeNull();expect(row.weightedScore).toBeNull();expect(r.weightedScore).toBeNull()
  expect(row.rankingScore).toBe(Math.min(row.mainScore,row.backupScore));expect(r.specialOperators).toContain('阿罗玛')
 })
 it('does not expose partial weighted values when either snapshot has unquantified efficiency',()=>{
  const w=fixture();w.mainPlan.facilities.room_1_1.slots[0]!.replacements=['黍']
  const r=estimateFixedDuty(w)
  expect(r.complete).toBe(false);expect(r.weightedScore).toBeNull();expect(r.rankingScore).toBeNull();expect(r.ordinaryWeightedScore).toBeNull()
  expect(r.rows.every(row=>row.weightedScore===null&&row.rankingScore===null)).toBe(true)
 })
 it('keeps Gladiia and consumption-skilled central supports conditional',()=>{
  const w=fixture();w.mainPlan.facilities.central.slots[0]={occupant:{kind:'operator',operatorId:'歌蕾蒂娅'},groupId:null,replacements:['阿米娅']}
  const r=estimateFixedDuty(w)
  expect(r.specialOperators).toContain('歌蕾蒂娅');expect(r.weightedScore).toBeNull()
  for(const row of r.rows){expect(row.ratio).toBeNull();expect(row.weightedScore).toBeNull();expect(row.rankingScore).toBe(Math.min(row.mainScore,row.backupScore))}
  expect(hasConsumptionSkill('砾')).toBe(false);expect(hasConsumptionSkill('未知干员')).toBe(true)
 })
})
