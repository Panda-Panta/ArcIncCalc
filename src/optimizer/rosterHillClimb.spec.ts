import {describe,it,expect,vi,afterEach} from 'vitest'
import * as neighborhood from './backupNeighborhood'
import * as scoring from './incomeComparison'
import {runRosterIncomeSearch} from './rosterIncomeSearch'
import {createDefaultWorkspace} from '../workbench/defaults'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import type {RosterWorkspace} from '../workbench/model'
const entries=['砾','断罪者','芬','香草','调香师','Castle-3'].map(operator=>({operator,elitePhase:['芬','香草'].includes(operator)?1:operator==='Castle-3'?0:2,level:operator==='Castle-3'?30:1}))
function workspace(a=false,b=false){const w=createDefaultWorkspace();for(const [i,name] of ['砾','断罪者'].entries()){const room=w.mainPlan.facilities[i===0?'room_1_1':'room_1_2'];room.slots[0]!.occupant={kind:'operator',operatorId:id(name)};room.slots[0]!.replacements=[id(i===0?(a?'调香师':'芬'):(b?'Castle-3':'香草'))]};return w}
const node=(w:RosterWorkspace)=>(w.mainPlan.facilities.room_1_1.slots[0]!.replacements[0]===id('调香师')?'1':'0')+(w.mainPlan.facilities.room_1_2.slots[0]!.replacements[0]===id('Castle-3')?'1':'0')
// A deterministic scoring oracle verifies search control, separately from real production tests.
function oracle(parentRegression=false){
 vi.spyOn(neighborhood,'generateBackupNeighbors').mockImplementation(w=>{
  const keys:Record<string,string[]>={'00':['10','01'],'10':['11','00'],'01':['11'],'11':['10']}
  return keys[node(w)]!.map(k=>({label:k,workspace:workspace(k[0]==='1',k[1]==='1'),move:{kind:'replace' as const,positions:[k]}}))
 })
 const real=scoring.summarizeIncome
 vi.spyOn(scoring,'summarizeIncome').mockImplementation(r=>{const c=real(r),k=node(r.inputs.schedule.sourceWorkspace);c.daily.lmd+=({'00':0,'10':100,'01':50,'11':200}[k]??0);c.closing.lmd+=c.daily.lmd;if(parentRegression){c.daily.gold+=k==='10'?20:k==='11'?10:0;c.closing.gold+=c.daily.gold};return c})
}
const request=()=>({baseline:workspace(),inventory:entries,objective:'lmd' as const,maxCandidates:4,mode:'hill-climb' as const,maxDepth:3,options:{sampleHours:1,warmupHours:0,production:{droneTarget:'none' as const}}})
afterEach(()=>vi.restoreAllMocks())
describe('bounded multi-step candidate search',()=>{
 it('continues from a verified improvement, traces two steps, and never evaluates a duplicate',()=>{
  oracle();const input=request(),before=structuredClone(input.baseline),r=runRosterIncomeSearch(input)
  expect(r.bestPath).toEqual(['baseline','candidate-1','candidate-2']);expect(r.candidates[2]!.depth).toBe(2)
  expect(r.candidates[2]!.parentId).toBe('candidate-1');expect(r.candidates[2]!.parentComparison!.status).toBe('improved')
  expect(new Set(r.candidates.map(c=>node(c.workspace))).size).toBe(r.candidates.length)
  expect(r.evaluatedCandidates).toBe(4);expect(r.candidates.every(c=>c.cases.length===4)).toBe(true)
  expect(input.baseline).toEqual(before)
 })
 it('honors depth independently of total candidate budget and reports the boundary',()=>{
  oracle();const r=runRosterIncomeSearch({...request(),maxDepth:1,maxCandidates:10})
  expect(r.candidates.every(c=>c.depth<=1)).toBe(true);expect(r.depthLimitReached).toBe(true);expect(r.stopReason).toBe('depth-limit')
 })
 it('retains single-pass mode without expanding improved nodes',()=>{
  oracle();const r=runRosterIncomeSearch({...request(),mode:'single-pass'})
  expect(r.candidates.map(c=>node(c.workspace))).toEqual(['00','10','01']);expect(r.exploredDepth).toBe(1)
 })
 it('does not promote a second step that loses a resource relative to its parent',()=>{
  oracle(true);const r=runRosterIncomeSearch(request()),second=r.candidates.find(c=>node(c.workspace)==='11')!
  expect(second.comparison!.status).toBe('improved');expect(second.parentComparison!.status).toBe('rejected');expect(r.bestCandidateId).toBe('candidate-1')
 })
 it('marks budget exhaustion while preserving a fully verified best path',()=>{
  oracle();const r=runRosterIncomeSearch({...request(),maxCandidates:2})
  expect(r.budgetExhausted).toBe(true);expect(r.stopReason).toBe('budget');expect(r.bestPath).toEqual(['baseline','candidate-1'])
 })
 it.each([0,9,1.5,NaN])('rejects invalid depth %s',maxDepth=>{expect(()=>runRosterIncomeSearch({...request(),maxDepth})).toThrow()})
})
