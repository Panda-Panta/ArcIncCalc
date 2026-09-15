import {describe,expect,it} from 'vitest'
import learned from '../data/mower-learned-combinations.json'
import checked from '../data/riic-combinations.json'
import {OPERATORS} from '../domain/operators'
import {compileOperatorInventory} from '../domain/operatorInventory'
import {selectCombinationCandidates} from './combinationCandidates'
import {admitCombinationCandidates} from './inventoryAdmission'
import {compileCandidateLayout,generateRosterDraft} from './rosterDraft'
import {createDefaultWorkspace} from '../workbench/defaults'
import {projectRosterOutput} from './rosterProjection'
const owned=OPERATORS.map(o=>({operator:o.name,elitePhase:o.rarity<3?0:o.rarity===3?1:2,level:o.rarity<3?30:o.rarity===3?55:o.rarity===4?70:o.rarity===5?80:90}))
const key=(c:{facility:string;product:string;operatorNames:string[]})=>JSON.stringify([c.facility,c.product,[...c.operatorNames].sort()])
describe('Mower learned local teams',()=>{
 it('extends the checked catalog with distinct, traceable, context-dependent hypotheses',()=>{
  const baseKeys=new Set(checked.candidates.map(key))
  expect(learned.candidates.length).toBeGreaterThan(0)
  expect(new Set(learned.candidates.map(c=>c.id)).size).toBe(learned.candidates.length)
  for(const c of learned.candidates){
   expect(baseKeys.has(key(c))).toBe(false)
   expect(c.supportAssignments).toEqual([])
   expect(c.verification.status).toBe('observed-unverified')
   expect(c.optimizerTags).toContain('mower-observed')
   expect(c.operatorNames.some(n=>['Free','Current','孑','但书','龙舌兰','佩佩','菲亚梅塔'].includes(n))).toBe(false)
   for(const evidence of c.sourceReferences.operatorSkillBuffIds){
    const operator=OPERATORS.find(o=>o.name===evidence.operatorName)!
    expect(evidence.buffIds).toEqual(operator.skills.map(s=>s.buffId))
   }
  }
  expect(selectCombinationCandidates(OPERATORS.map(o=>o.name)).available).toHaveLength(checked.candidates.length+learned.candidates.length)
 })
 it('enforces actual ownership and skill-stage admission for observed teams',()=>{
  const c=learned.candidates.find(c=>c.operatorNames.includes('铅踝'))!
  const available=selectCombinationCandidates(c.operatorNames).available.find(a=>a.id===c.id)!
  expect(compileCandidateLayout(available).assignments).toHaveLength(1)
  expect(selectCombinationCandidates(c.operatorNames.filter(n=>n!=='铅踝')).unavailable.find(a=>a.id===c.id)?.missingOperators.map(o=>o.name)).toContain('铅踝')
  const low=owned.map(o=>o.operator==='铅踝'?{...o,elitePhase:0,level:1}:o)
  expect(admitCombinationCandidates(compileOperatorInventory(low)).find(a=>a.candidate.id===c.id)?.status).toBe('skills-locked')
 })
 it('can place and score an observed team through the production path without a source efficiency constant',()=>{
  const c=learned.candidates.find(c=>c.facility==='MANUFACTURE'&&c.product==='exp'&&c.operatorNames.join('+')==='Castle-3+断罪者+铅踝')!
  expect(c).toBeDefined()
  const base=createDefaultWorkspace()
  base.mainPlan.facilities.room_1_1.product='exp'
  const draft=generateRosterDraft(base,owned,[c.id])
  expect(draft.status).toBe('draft')
  expect(draft.placements.some(p=>p.candidateId===c.id)).toBe(true)
  const score=projectRosterOutput(draft.workspace!)
  expect(score.complete).toBe(true)
  expect(score.daily.score).toBeGreaterThan(projectRosterOutput(base).daily.score)
 })
})
