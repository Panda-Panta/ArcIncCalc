import {afterEach,describe,it,expect,vi} from 'vitest'
import * as neighborhood from './backupNeighborhood'
import * as scoring from './incomeComparison'
import {runRosterIncomeSearch,type IncomeSearchProgress} from './rosterIncomeSearch'
import {createDefaultWorkspace} from '../workbench/defaults'
import {resolveOperatorCharId as id} from '../workbench/compat/mowerJson'
import type {RosterWorkspace} from '../workbench/model'
const inventory=[
 {operator:'砾',elitePhase:2,level:70},{operator:'断罪者',elitePhase:2,level:70},
 {operator:'芬',elitePhase:1,level:55},{operator:'香草',elitePhase:1,level:55},
 {operator:'调香师',elitePhase:2,level:70},{operator:'Castle-3',elitePhase:0,level:30},
]
type Node='O'|'A'|'B'|'C'
function workspace(node:Node='O'){
 const w=createDefaultWorkspace()
 for(const [index,name] of ['砾','断罪者'].entries()){
  const room=w.mainPlan.facilities[index===0?'room_1_1':'room_1_2'];room.slots[0]!.occupant={kind:'operator',operatorId:id(name)}
  room.slots[0]!.replacements=[id(index===0?(['A','C'].includes(node)?'调香师':'芬'):(['B','C'].includes(node)?'Castle-3':'香草'))]
 }
 return w
}
function node(w:RosterWorkspace):Node{
 const a=w.mainPlan.facilities.room_1_1.slots[0]!.replacements[0]===id('调香师'),b=w.mainPlan.facilities.room_1_2.slots[0]!.replacements[0]===id('Castle-3')
 return a?(b?'C':'A'):(b?'B':'O')
}
// Controlled scores test path selection and simulation reuse, separately from production regressions.
function oracle(parentRegression:boolean){
 const calls:Node[]=[]
 const graph:Record<Node,Node[]>={O:['A','B'],A:['C','O'],B:['C'],C:['A','B','O']}
 vi.spyOn(neighborhood,'generateBackupNeighbors').mockImplementation(w=>graph[node(w)].map(next=>({label:next,workspace:workspace(next),move:{kind:'replace',positions:[next]}})))
 const summarize=scoring.summarizeIncome
 vi.spyOn(scoring,'summarizeIncome').mockImplementation(report=>{
  const key=node(report.inputs.schedule.sourceWorkspace),c=summarize(report);calls.push(key)
  const lmd={O:0,A:100,B:50,C:200}[key],gold=parentRegression?{O:0,A:20,B:0,C:10}[key]:0
  c.daily.lmd+=lmd;c.closing.lmd+=lmd;c.daily.gold+=gold;c.closing.gold+=gold
  return c
 })
 return calls
}
const request=()=>({baseline:workspace(),inventory,objective:'lmd' as const,mode:'hill-climb' as const,maxCandidates:8,maxDepth:3,options:{sampleHours:1,warmupHours:0,production:{droneTarget:'none' as const}}})
afterEach(()=>vi.restoreAllMocks())
describe('cached simulation with independent parent and provenance routes',()=>{
 it('reuses C after rejecting A→C and accepts the independent resource-safe B→C route',()=>{
  const calls=oracle(true),input=request(),before=structuredClone(input.baseline),r=runRosterIncomeSearch(input)
  const routes=r.candidates.filter(c=>node(c.workspace)==='C')
  expect(routes).toHaveLength(2)
  expect(routes[0]).toMatchObject({cached:false,parentComparison:{status:'rejected'},comparison:{status:'improved'}})
  expect(routes[1]).toMatchObject({cached:true,parentComparison:{status:'improved'},comparison:{status:'improved'}})
  expect(node(r.candidates.find(c=>c.id===routes[0]!.parentId)!.workspace)).toBe('A')
  expect(node(r.candidates.find(c=>c.id===routes[1]!.parentId)!.workspace)).toBe('B')
  expect(r.bestCandidateId).toBe(routes[1]!.id)
  expect(r.bestPath.map(id=>node(r.candidates.find(c=>c.id===id)!.workspace))).toEqual(['O','B','C'])
  expect(r.simulatedCandidates).toBe(4);expect(r.evaluatedCandidates).toBe(5)
  expect(calls.filter(n=>n==='C')).toHaveLength(4);expect(calls).toHaveLength(16)
  expect(input.baseline).toEqual(before)
 })
 it('keeps the same cached workspace eligible through a baseline route after a conditional draft',()=>{
  const calls=oracle(false),input={...request(),draft:workspace('A'),conditional:true,maxCandidates:4},progress:IncomeSearchProgress[]=[]
  const r=runRosterIncomeSearch(input,p=>progress.push(p))
  const routes=r.candidates.filter(c=>node(c.workspace)==='A')
  expect(routes).toHaveLength(2)
  expect(routes[0]).toMatchObject({origin:'draft',conditional:true,cached:false,comparison:{status:'conditional'}})
  expect(routes[1]).toMatchObject({origin:'baseline',conditional:false,cached:true,comparison:{status:'improved'}})
  expect(calls.filter(n=>n==='A')).toHaveLength(4)
  expect(r.simulatedCandidates).toBe(3);expect(r.evaluatedCandidates).toBe(4)
  const best=r.candidates.find(c=>c.id===r.bestCandidateId)!
  expect(best.origin).toBe('baseline');expect(best.conditional).toBe(false)
  for(const p of progress.filter(p=>p.completed))expect(p.completed!.cases).toHaveLength(4)
  expect(progress.filter(p=>p.completed).map(p=>p.completed!.id)).toEqual(r.candidates.map(c=>c.id))
 })
 it('counts cached route evaluation toward the path budget and never loops back through ancestors',()=>{
  oracle(true);const r=runRosterIncomeSearch({...request(),maxCandidates:5,maxDepth:8})
  expect(r.evaluatedCandidates).toBe(5);expect(r.simulatedCandidates).toBe(4)
  expect(r.candidates.filter(c=>node(c.workspace)==='O')).toHaveLength(1)
  for(const candidate of r.candidates){
   const ancestors=new Set<Node>();let current:typeof candidate|undefined=candidate
   while(current){expect(ancestors.has(node(current.workspace))).toBe(false);ancestors.add(node(current.workspace));current=r.candidates.find(c=>c.id===current!.parentId)}
  }
  expect(r.bestPath.map(id=>node(r.candidates.find(c=>c.id===id)!.workspace))).toEqual(['O','B','C'])
 })
})