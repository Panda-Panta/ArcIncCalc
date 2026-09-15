import {describe, expect, it} from 'vitest'
import {sampleCombinationTemplates} from './templateSampling'
const pool = (count:number, observed:boolean) => Array.from({length:count},(_,id)=>({id,optimizerTags:observed?['mower-observed']:[]}))
describe('observed and checked template sampling',()=>{
 it('reserves half of a bounded search for checked mechanics despite a large observed corpus',()=>{
  const candidates=[...pool(20,false),...pool(300,true)],before=JSON.stringify(candidates)
  const sample=sampleCombinationTemplates(candidates,()=>.37,12)
  expect(sample).toHaveLength(12)
  expect(sample.filter(c=>c.optimizerTags.includes('mower-observed'))).toHaveLength(6)
  expect(new Set(sample).size).toBe(12)
  expect(JSON.stringify(candidates)).toBe(before)
  expect(sample).toEqual(sampleCombinationTemplates(candidates,()=>.37,12))
 })
 it('uses the remaining pool when one source is small or absent',()=>{
  expect(sampleCombinationTemplates(pool(20,true),()=>.5,12)).toHaveLength(12)
  expect(sampleCombinationTemplates(pool(20,false),()=>.5,12)).toHaveLength(12)
  expect(sampleCombinationTemplates([...pool(2,true),...pool(20,false)],()=>.5,12)).toHaveLength(12)
  expect(sampleCombinationTemplates(pool(2,true),()=>.5,12)).toHaveLength(2)
 })
})
