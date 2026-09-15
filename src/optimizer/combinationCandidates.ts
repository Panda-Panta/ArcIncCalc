import catalog from '../data/riic-combinations.json'
import learnedCatalog from '../data/mower-learned-combinations.json'
import { OPERATORS } from '../domain/operators'

export type CandidateCoverageScope = 'complete-team' | 'partial-template' | 'support-policy'
export type CandidateRoom = 'MANUFACTURE' | 'TRADING' | 'POWER' | 'CONTROL' | 'DORMITORY' | 'HIRE' | 'TRAINING' | 'MEETING'

interface RawSupportAssignment {
  facility: CandidateRoom
  roomKey: string
  operatorNames: string[]
  role: string
}

interface RawCandidate {
  id: string
  name: string
  family: string
  facility: CandidateRoom
  product: string
  operatorNames: string[]
  supportAssignments: RawSupportAssignment[]
  conditions: {
    facility: string[]
    roster: string[]
    morale: string[]
    resources: string[]
    slotCount: { exact: number }
  }
  substitutions: Array<{ operatorNames?: string[]; effect?: string }>
  conflicts: string[]
  efficiencyFormula: string
  warmup: unknown
  moraleCaveats: string[]
  verification: { status: string; evidence: string }
  sourceReferences: {
    catalog: string
    links: string
    operatorSkillBuffIds: Array<{ operatorName: string; buffIds: string[] }>
    termIds: string[]
  }
  optimizerTags: string[]
  coverageScope: CandidateCoverageScope
}

interface RawCatalog {
  candidates: RawCandidate[]
}

const rawCatalog: RawCatalog = { candidates: [...(catalog as RawCatalog).candidates, ...(learnedCatalog as RawCatalog).candidates] }
const operatorByName = new Map(OPERATORS.map((operator) => [operator.name, operator]))
const operatorById = new Map(OPERATORS.map((operator) => [operator.charId, operator]))

export interface CandidateOperatorRef {
  charId: string
  name: string
}

export interface CandidateAssignment {
  /** AppConfig placement bucket; MEETING is stored as reception. */
  runtimeFacilityKey: 'rooms' | 'controlOperatorIds' | 'dormitories' | 'reception' | 'office' | 'training' | 'workshop'
  roomKey: string
  facility: CandidateRoom
  role: 'target' | 'support'
  operators: CandidateOperatorRef[]
}

export interface CandidateMissingOperator extends CandidateOperatorRef {
  roomKey: string
  facility: CandidateRoom
  role: 'target' | 'support'
}

export interface CandidateReplacementPossibility {
  operatorNames: string[]
  operatorIds: Array<string | null>
  effect: string | null
  allOwned: boolean
}

export interface CandidateEvidence {
  catalog: string
  links: string
  buffIdsByOperator: Array<{ operator: CandidateOperatorRef; buffIds: string[] }>
  termIds: string[]
  verification: RawCandidate['verification']
}

export interface CandidateConstraintSnapshot {
  scope: CandidateCoverageScope
  facility: RawCandidate['conditions']['facility']
  roster: RawCandidate['conditions']['roster']
  morale: RawCandidate['conditions']['morale']
  resources: RawCandidate['conditions']['resources']
  slotCount: RawCandidate['conditions']['slotCount']
  conflicts: string[]
  warmup: unknown
  moraleCaveats: string[]
}

export interface CandidateAvailability {
  id: string
  name: string
  family: string
  facility: CandidateRoom
  product: string
  scope: CandidateCoverageScope
  optimizerTags: string[]
  targetAssignment: CandidateAssignment
  supportAssignments: CandidateAssignment[]
  missingOperators: CandidateMissingOperator[]
  isFullyOwned: boolean
  replacements: CandidateReplacementPossibility[]
  constraints: CandidateConstraintSnapshot
  evidence: CandidateEvidence
  /** Documentation only. Consumers must not execute or parse this formula. */
  efficiencyFormula: string
}

export interface CandidateSelectionOptions {
  scopes?: readonly CandidateCoverageScope[]
  includeUnavailable?: boolean
  /** Observations supply team hypotheses; efficiency is recalculated in the actual layout. */
  includeObserved?: boolean
}

export interface CandidateSelection {
  available: CandidateAvailability[]
  unavailable: CandidateAvailability[]
  unknownOwnedReferences: string[]
}

function toOperatorRef(name: string): CandidateOperatorRef {
  const operator = operatorByName.get(name)
  if (!operator) throw new Error(`RIIC combination catalog refers to unknown operator: ${name}`)
  return { charId: operator.charId, name: operator.name }
}

function resolveOwnedReferences(references: readonly string[]): { ownedIds: Set<string>; unknown: string[] } {
  const ownedIds = new Set<string>()
  const unknown: string[] = []
  for (const reference of references) {
    const operator = operatorById.get(reference) ?? operatorByName.get(reference)
    if (operator) ownedIds.add(operator.charId)
    else unknown.push(reference)
  }
  return { ownedIds, unknown }
}

function runtimeFacilityKey(facility: CandidateRoom): CandidateAssignment['runtimeFacilityKey'] {
  switch (facility) {
    case 'CONTROL': return 'controlOperatorIds'
    case 'DORMITORY': return 'dormitories'
    case 'MEETING': return 'reception'
    case 'HIRE': return 'office'
    case 'TRAINING': return 'training'
    default: return 'rooms'
  }
}

function assignment(roomKey: string, facility: CandidateRoom, role: 'target' | 'support', names: string[]): CandidateAssignment {
  return { runtimeFacilityKey: runtimeFacilityKey(facility), roomKey, facility, role, operators: names.map(toOperatorRef) }
}

function candidateAvailability(candidate: RawCandidate, ownedIds: Set<string>): CandidateAvailability {
  const targetAssignment = assignment('target', candidate.facility, 'target', candidate.operatorNames)
  const supportAssignments = candidate.supportAssignments.map((support) => assignment(
    support.roomKey,
    support.facility,
    'support',
    support.operatorNames,
  ))
  const allAssignments = [targetAssignment, ...supportAssignments]
  const missingOperators = allAssignments.flatMap((current) => current.operators
    .filter((operator) => !ownedIds.has(operator.charId))
    .map((operator) => ({ ...operator, roomKey: current.roomKey, facility: current.facility, role: current.role })))
  const replacements = candidate.substitutions.map((substitution) => {
    const names = substitution.operatorNames ?? []
    const ids = names.map((name) => operatorByName.get(name)?.charId ?? null)
    return {
      operatorNames: names,
      operatorIds: ids,
      effect: substitution.effect ?? null,
      allOwned: ids.length > 0 && ids.every((id) => id !== null && ownedIds.has(id)),
    }
  })

  return {
    id: candidate.id,
    name: candidate.name,
    family: candidate.family,
    facility: candidate.facility,
    product: candidate.product,
    scope: candidate.coverageScope,
    optimizerTags: [...candidate.optimizerTags],
    targetAssignment,
    supportAssignments,
    missingOperators,
    isFullyOwned: missingOperators.length === 0,
    replacements,
    constraints: {
      scope: candidate.coverageScope,
      facility: [...candidate.conditions.facility],
      roster: [...candidate.conditions.roster],
      morale: [...candidate.conditions.morale],
      resources: [...candidate.conditions.resources],
      slotCount: { ...candidate.conditions.slotCount },
      conflicts: [...candidate.conflicts],
      warmup: candidate.warmup,
      moraleCaveats: [...candidate.moraleCaveats],
    },
    evidence: {
      catalog: candidate.sourceReferences.catalog,
      links: candidate.sourceReferences.links,
      buffIdsByOperator: candidate.sourceReferences.operatorSkillBuffIds.map((entry) => ({
        operator: toOperatorRef(entry.operatorName),
        buffIds: [...entry.buffIds],
      })),
      termIds: [...candidate.sourceReferences.termIds],
      verification: { ...candidate.verification },
    },
    efficiencyFormula: candidate.efficiencyFormula,
  }
}

/**
 * Resolves Chinese names or charIds, then returns room-aware candidate constraints.
 * It deliberately does not evaluate `efficiencyFormula` or choose a final roster.
 */
export function selectCombinationCandidates(
  ownedOperatorReferences: readonly string[],
  options: CandidateSelectionOptions = {},
): CandidateSelection {
  const { ownedIds, unknown } = resolveOwnedReferences(ownedOperatorReferences)
  const scopes = new Set<CandidateCoverageScope>(options.scopes ?? ['complete-team', 'partial-template', 'support-policy'])
  const candidates = rawCatalog.candidates
    .filter((candidate) => scopes.has(candidate.coverageScope) && (options.includeObserved !== false || !candidate.optimizerTags.includes('mower-observed')))
    .map((candidate) => candidateAvailability(candidate, ownedIds))
  const available = candidates.filter((candidate) => candidate.isFullyOwned)
  const unavailable = options.includeUnavailable === false
    ? []
    : candidates.filter((candidate) => !candidate.isFullyOwned)
  return { available, unavailable, unknownOwnedReferences: unknown }
}

export const RIIC_COMBINATION_CANDIDATE_COUNT = rawCatalog.candidates.length

