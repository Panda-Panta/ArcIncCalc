import { describe, expect, it } from 'vitest'
import { OPERATORS } from '../domain/operators'
import {
  RIIC_COMBINATION_CANDIDATE_COUNT,
  selectCombinationCandidates,
} from './combinationCandidates'

const id = (name: string) => OPERATORS.find((operator) => operator.name === name)!.charId

const find = (items: ReturnType<typeof selectCombinationCandidates>['available'], candidateId: string) =>
  items.find((candidate) => candidate.id === candidateId)!

describe('RIIC combination candidate consumer', () => {
  it('resolves mixed charIds and Chinese names into a fully owned, room-aware candidate', () => {
    const result = selectCombinationCandidates([
      id('多萝西'), '淬羽赫默', id('弑君者'), 'Mon3tr',
    ])
    const candidate = find(result.available, 'manu-exp-rhine-trio')

    expect(candidate.scope).toBe('partial-template')
    expect(candidate.targetAssignment).toMatchObject({ facility: 'MANUFACTURE', roomKey: 'target' })
    expect(candidate.targetAssignment.operators.map((operator) => operator.name)).toEqual(['多萝西', '淬羽赫默', '弑君者'])
    expect(candidate.supportAssignments).toEqual([expect.objectContaining({
      facility: 'CONTROL', roomKey: 'control-support-1', operators: [expect.objectContaining({ name: 'Mon3tr' })],
    })])
    expect(candidate.missingOperators).toEqual([])
    expect(candidate.evidence.buffIdsByOperator.flatMap((entry) => entry.buffIds)).toContain('control_prod_spd[1000]')
  })

  it('reports a missing cross-room support assignment instead of treating target ownership as sufficient', () => {
    const result = selectCombinationCandidates(['多萝西', '淬羽赫默', '弑君者'])
    const candidate = result.unavailable.find((entry) => entry.id === 'manu-exp-rhine-trio')!

    expect(candidate.isFullyOwned).toBe(false)
    expect(candidate.missingOperators).toEqual([expect.objectContaining({
      name: 'Mon3tr', facility: 'CONTROL', roomKey: 'control-support-1', role: 'support',
    })])
  })

  it('keeps same-candidate occupants separated by roomKey and exposes global conflict inputs', () => {
    const result = selectCombinationCandidates(['埃癸斯', '结城理'])
    const candidate = find(result.available, 'power-aigis-makoto')

    expect(candidate.targetAssignment.operators[0]).toMatchObject({ name: '埃癸斯' })
    expect(candidate.supportAssignments[0]).toMatchObject({
      facility: 'MANUFACTURE', roomKey: 'manufacture-1', operators: [expect.objectContaining({ name: '结城理' })],
    })
    expect(candidate.targetAssignment.operators[0]!.charId).not.toBe(candidate.supportAssignments[0]!.operators[0]!.charId)
    expect(candidate.supportAssignments[0]!.runtimeFacilityKey).toBe('rooms')
  })

  it('maps a meeting-room support to the AppConfig reception placement bucket', () => {
    const result = selectCombinationCandidates(['结城理', '砾', '阿罗玛', '埃癸斯', '岳羽由加莉', '虎狼丸'])
    const candidate = find(result.available, 'manu-exp-p3-makoto')
    expect(candidate.supportAssignments.find((assignment) => assignment.facility === 'MEETING')).toMatchObject({
      roomKey: 'meeting', runtimeFacilityKey: 'reception',
    })
  })

  it('distinguishes complete teams, templates and support policies and supports scope filtering', () => {
    const onlyTeams = selectCombinationCandidates(['泡泡', '火神', '铅踝'], {
      scopes: ['complete-team'],
      includeUnavailable: false,
    })
    expect(find(onlyTeams.available, 'manu-gold-bubble-vulcan').scope).toBe('complete-team')
    expect(onlyTeams.available.every((candidate) => candidate.scope === 'complete-team')).toBe(true)

    const policy = selectCombinationCandidates(['凛御银灰'], { scopes: ['support-policy'] })
    expect(find(policy.available, 'control-silverash-alter-karlan').scope).toBe('support-policy')
  })

  it('returns unknown references and evaluates documented substitutions without executing formulas', () => {
    const result = selectCombinationCandidates(['凯尔希', '不存在的干员'])
    const candidate = result.unavailable.find((entry) => entry.id === 'control-mon3tr-kaltsit')!

    expect(result.unknownOwnedReferences).toEqual(['不存在的干员'])
    expect(candidate.replacements).toEqual([expect.objectContaining({
      operatorNames: ['凯尔希'], allOwned: true,
    })])
    expect(candidate.efficiencyFormula).toContain('全局制造')
  })

  it('loads the full checked catalog rather than a hand-written subset', () => {
    expect(RIIC_COMBINATION_CANDIDATE_COUNT).toBeGreaterThanOrEqual(50)
  })
})


