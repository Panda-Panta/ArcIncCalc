import { describe, it, expect } from 'vitest'
import { buildIsolatedFeatureTable } from './operatorIsolatedFeatures'
import { extractFacilityFeaturesFromWorkspace } from './globalFacilityFeatures'
import { generateCandidateBatch, candidateToWorkspace } from './hierarchicalScheduleSampler'
import { createDefaultWorkspace } from '../workbench/defaults'
import { MOWER_OUTPUT_ROOM_IDS } from '../workbench/model'

describe('Hierarchical Schedule Sampler', () => {
  it('generates valid candidate batch respecting room capacities and unique operator constraints', () => {
    const table = buildIsolatedFeatureTable()
    const ws = createDefaultWorkspace()
    const facility = extractFacilityFeaturesFromWorkspace(ws)

    const N = 500
    const { tensorBuffer, candidates } = generateCandidateBatch(facility, table, {
      count: N,
      baselineWorkspace: ws,
    })

    expect(candidates.length).toBe(N)
    expect(tensorBuffer.length).toBe(N * 480)

    // 抽样检查前 10 个候选方案的合法性
    for (let i = 0; i < 10; i++) {
      const candidate = candidates[i]!
      expect(candidate.prodAssignments.length).toBe(27)
      expect(candidate.centralAssignments.length).toBe(5)

      // 验证无同干员重复分配
      const used = new Set<string>()
      for (const id of candidate.prodAssignments) {
        if (id) {
          expect(used.has(id)).toBe(false)
          used.add(id)
        }
      }
      for (const id of candidate.centralAssignments) {
        if (id) {
          expect(used.has(id)).toBe(false)
          used.add(id)
        }
      }

      // 验证未激活工位无干员进驻
      for (let r = 0; r < 9; r++) {
        const room = facility.rooms[r]!
        for (let s = room.slotCount; s < 3; s++) {
          expect(candidate.prodAssignments[r * 3 + s]).toBeNull()
        }
      }
    }
  })

  it('correctly decodes candidate back into valid RosterWorkspace', () => {
    const table = buildIsolatedFeatureTable()
    const ws = createDefaultWorkspace()
    const facility = extractFacilityFeaturesFromWorkspace(ws)

    const { candidates } = generateCandidateBatch(facility, table, {
      count: 1,
      baselineWorkspace: ws,
    })

    const candidate = candidates[0]!
    const restored = candidateToWorkspace(candidate, ws)

    // 验证还原后的房间干员与 candidate 分配完全一致
    MOWER_OUTPUT_ROOM_IDS.forEach((roomId, rIdx) => {
      const room = restored.mainPlan.facilities[roomId]
      room.slots.forEach((slot, sIdx) => {
        const expectedId = candidate.prodAssignments[rIdx * 3 + sIdx]
        if (expectedId) {
          expect(slot.occupant.kind).toBe('operator')
          if (slot.occupant.kind === 'operator') {
            expect(slot.occupant.operatorId).toBe(expectedId)
          }
        } else {
          expect(slot.occupant.kind).toBe('empty')
        }
      })
    })
  })
})
