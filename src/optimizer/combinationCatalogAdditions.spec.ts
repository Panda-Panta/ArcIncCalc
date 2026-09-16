import {describe,it,expect} from 'vitest'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import raw from '../data/riic-combinations.json'
import {OPERATORS} from '../domain/operators'
import {matchesRiicIdentity} from '../domain/riicIdentity'
import {createDefaultConfig} from '../domain/defaults'
import {evaluateOperators} from '../engine/operatorRules'
import {evaluateDormitoryRecovery} from '../engine/dormitoryRecovery'
import {buildRiicGlobalContext} from '../engine/globalContext'
import {selectCombinationCandidates} from './combinationCandidates'
import {compileCandidateLayout} from './rosterDraft'
const byId=new Map(raw.candidates.map(c=>[c.id,c]))
const op=(name:string)=>OPERATORS.find(o=>o.name===name)!
const id=(name:string)=>op(name).charId
const codexCatalog=resolve('.codex/skills/arknights-riic-mechanics/references/catalog.json')
const codexTerms=resolve('.codex/skills/arknights-riic-mechanics/references/terms.json')
const source=JSON.parse(readFileSync(existsSync(codexCatalog)?codexCatalog:resolve('src/data/riic-catalog.baseline-v076.json'),'utf8')) as {operators:{name:string;slots:{buffId:string;description:string}[][]}[]}
const terms=JSON.parse(readFileSync(existsSync(codexTerms)?codexTerms:resolve('src/data/riic-term-evidence.json'),'utf8')) as {terms:Record<string,{description:string}>}
function setup(names:string[],control:string[]=[]){
 const c=createDefaultConfig();c.controlOperatorIds=control.map(id);c.rooms.forEach(r=>r.operatorIds=[])
 c.facilityOperatorIds={dormitories:[[],[],[],[]],reception:[],office:[],training:[],workshop:[]}
 const room=c.rooms.find(r=>r.type==='trading')!;room.operatorIds=names.map(id)
 return {c,room}
}
describe('source-backed conventional combination additions',()=>{
 it('records exactly five additions with unchanged source buff evidence and valid concrete positions',()=>{
  const additions=['trade-goldline-hongxue-tuye-durin-four','trade-glasgow-morgan-solo','trade-glasgow-siege-morgan','trade-glasgow-siege-morgan-delphine','dorm-siege-morgan-recovery']
  const candidates=selectCombinationCandidates(OPERATORS.map(o=>o.charId)).available
  for(const key of additions){
   const item=byId.get(key)!;expect(item).toBeDefined()
   const contract=compileCandidateLayout(candidates.find(c=>c.id===key)!)
   expect(contract.assignments[0]!.operatorIds).toEqual(item.operatorNames.map(id))
   for(const evidence of item.sourceReferences.operatorSkillBuffIds){
    const original=source.operators.find(o=>o.name===evidence.operatorName)!
    for(const buff of evidence.buffIds){expect(original.slots.flat().some(s=>s.buffId===buff)).toBe(true);expect(op(evidence.operatorName).skills.some(s=>s.buffId===buff)).toBe(true)}
   }
  }
 })
 it('preserves single-Morgan and no-center comparisons instead of making Delphine globally required',()=>{
  expect(byId.get('trade-glasgow-morgan-solo')!.supportAssignments).toEqual([])
  expect(byId.get('trade-glasgow-siege-morgan')!.supportAssignments).toEqual([])
  const full=byId.get('trade-glasgow-siege-morgan-delphine')!
  expect(full.operatorNames).toEqual(['推进之王','摩根'])
  expect(full.supportAssignments).toMatchObject([{facility:'CONTROL',operatorNames:['戴菲恩']}])
  const original=source.operators.find(o=>o.name==='摩根')!.slots.flat().find(s=>s.buffId==='trade_ord_spd_par[000]')!
  expect(original.description).toContain('推进之王');expect(original.description).toContain('同一个贸易站')
 })
 it.each([[['摩根'],[],121],[['摩根'],['戴菲恩'],131],[['推进之王','摩根'],[],177],[['推进之王','摩根'],['戴菲恩'],197]] as [string[],string[],number][])('calculates actual Morgan team %j with center %j = %s percent', (names,center,total)=>{
  const {c,room}=setup(names,center);expect(evaluateOperators(room,c).efficiencyPercent).toBe(total)
 })
 it('does not inherit Siege identity or the named bonus through her alter',()=>{
  expect(matchesRiicIdentity(op('维娜·维多利亚'),'groupId','glasgow')).toBe(false)
  const {c,room}=setup(['摩根','维娜·维多利亚'])
  expect(evaluateOperators(room,c).operatorContributions.find(o=>o.operatorName==='摩根')!.skillBonus).toBe(20)
 })
 it('represents all five choose-four Durin support groups and caps actual present count at four',()=>{
  const expected=['至简','桃金娘','褐果','杜林','特克诺']
  expect(terms.terms['cc.tag.durin']!.description.split('\n')[1]!.split('、').sort()).toEqual([...expected].sort())
  const item=byId.get('trade-goldline-hongxue-tuye-durin-four')!,groups=[item.supportAssignments[0]!.operatorNames,...item.substitutions.map(s=>s.operatorNames!)]
  expect(groups).toHaveLength(5);expect(new Set(groups.map(g=>[...g].sort().join(','))).size).toBe(5)
  for(const group of groups){expect(new Set(group).size).toBe(4);expect(group.every(n=>expected.includes(n)&&!op(n).isAlter)).toBe(true)}
  const {c,room}=setup(['鸿雪','图耶']);const factories=c.rooms.filter(r=>r.type==='manufacture').slice(0,2)
  factories.forEach(r=>r.product='gold');c.rooms=[room,...factories]
  expect(buildRiicGlobalContext(c).durinGoldProductionLines).toBe(0)
  expect(evaluateOperators(room,c).efficiencyPercent).toBe(132)
  for(const group of groups){c.facilityOperatorIds.dormitories=[group.map(id),[],[],[]];expect(buildRiicGlobalContext(c).durinGoldProductionLines).toBe(4);expect(evaluateOperators(room,c).efficiencyPercent).toBe(182)}
  c.facilityOperatorIds.dormitories=[expected.map(id),[],[],[]]
  expect(buildRiicGlobalContext(c).durinGoldProductionLines).toBe(4)
  expect(byId.get('trade-goldline-hongxue-tuye')!.supportAssignments).toEqual([])
 })
 it('counts Exusiai own 35 and allows only the explicitly named alter exception for Lemuen',()=>{
  let s=setup(['蕾缪安','能天使']);expect(evaluateOperators(s.room,s.c).efficiencyPercent).toBe(182)
  s=setup(['蕾缪安','新约能天使']);expect(evaluateOperators(s.room,s.c).efficiencyPercent).toBe(162)
  expect(matchesRiicIdentity(op('新约能天使'),'nationId','laterano')).toBe(false)
  expect(terms.terms['cc.angel']!.description).toContain('新约能天使')
  expect(byId.get('trade-lemuen-exusiai')!.substitutions[0]!.operatorNames).toEqual(['蕾缪安','新约能天使'])
  s=setup(['蕾缪安','能天使','新约能天使'])
  expect(evaluateOperators(s.room,s.c).operatorContributions.find(o=>o.operatorName==='蕾缪安')!.skillBonus).toBe(45)
 })
 it('models Morgan rest synergy only with Siege in the same dorm and only for Glasgow members',()=>{
  const {c}=setup([]);c.facilities.dormitories=[5];c.facilityOperatorIds.dormitories=[['推进之王','摩根','芬'].map(id)]
  const moods=new Map(c.facilityOperatorIds.dormitories[0]!.map(i=>[i,10]))
  let r=evaluateDormitoryRecovery(c,0,moods,5000)
  expect(r.rates.get(id('摩根'))).toBeCloseTo(4.5);expect(r.rates.get(id('推进之王'))).toBeCloseTo(4.5);expect(r.rates.get(id('芬'))).toBeCloseTo(4.2)
  c.facilityOperatorIds.dormitories=[['摩根','芬'].map(id)]
  r=evaluateDormitoryRecovery(c,0,moods,5000);expect(r.rates.get(id('摩根'))).toBe(4)
 })
})