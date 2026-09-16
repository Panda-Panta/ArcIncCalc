import { describe, it, expect } from 'vitest'
import { buildIsolatedFeatureTable } from './operatorIsolatedFeatures'
import { extractFacilityFeaturesFromWorkspace } from './globalFacilityFeatures'
import { encodeScheduleToTensor, ENCODING_TENSOR_DIM } from './scheduleEncoding'
import { createDefaultWorkspace } from '../workbench/defaults'

describe('Surrogate Feature Engineering & Encoding', () => {
  it('builds isolated feature table for all 429 operators', () => {
    const table = buildIsolatedFeatureTable()
    expect(table.size).toBe(429)

    const silverash = table.get('char_010_chen')
    expect(silverash).toBeDefined()
    expect(silverash?.vocabIndex).toBeGreaterThanOrEqual(0)
    expect(silverash?.factions).toHaveLength(10)
    expect(silverash?.synergyTags).toHaveLength(8)
    expect(Number.isFinite(silverash?.dutyCycleRatio)).toBe(true)
  })

  it('extracts facility features correctly from default workspace', () => {
    const ws = createDefaultWorkspace()
    const features = extractFacilityFeaturesFromWorkspace(ws)

    expect(features.rooms).toHaveLength(9)
    expect(features.meetingLevel).toBeGreaterThanOrEqual(1)
    expect(features.powerGeneration).toBeGreaterThanOrEqual(0)
    expect(features.powerConsumption).toBeGreaterThan(0)
    expect(features.dormLevelSum).toBeGreaterThanOrEqual(4)
  })

  it('encodes schedule into exactly 480-dimensional Float32Array without NaNs', () => {
    const table = buildIsolatedFeatureTable()
    const ws = createDefaultWorkspace()
    const facility = extractFacilityFeaturesFromWorkspace(ws)

    const prodAssignments = new Array(27).fill(null)
    prodAssignments[0] = 'char_002_amiya'
    prodAssignments[1] = 'char_102_durn'

    const centralAssignments = new Array(5).fill(null)
    centralAssignments[0] = 'char_003_kalts'

    const tensor = encodeScheduleToTensor(prodAssignments, centralAssignments, facility, table)

    expect(tensor).toBeInstanceOf(Float32Array)
    expect(tensor.length).toBe(ENCODING_TENSOR_DIM)
    expect(tensor.length).toBe(480)

    for (let i = 0; i < tensor.length; i++) {
      expect(Number.isFinite(tensor[i])).toBe(true)
    }

    // 验证中枢同类取最高显式项 (凯尔希 +2% 制造)
    // offset 378 + 40 = 418
    expect(tensor[418]).toBeCloseTo(0.02)
  })
})
