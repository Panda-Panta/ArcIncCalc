import { isUnsupportedTradeOperator } from '../domain/shiftRunPolicy'
import { GAME_DATA_VERSION, OPERATOR_MAP } from '../domain/operators'
import { resolveOperatorCharId } from '../workbench/compat/mowerJson'
import type { MowerMainConf, RosterWorkspace } from '../workbench/model'
import type { CompiledSchedule, CompiledSlot, SimulationAssumptions } from './types'

const LIST_POLICIES = ['exhaust_require', 'rest_in_full', 'resting_priority', 'workaholic', 'refresh_trading', 'refresh_drained', 'ope_resting_priority'] as const
const DEFAULTS: SimulationAssumptions = {
  schemaVersion: 1, initialMorale: 24, restingThreshold: 0.65, rescueThreshold: 0.75, fiammettaFool: true, fiammettaThreshold: 0.9, operatorMorale: {}, dormAtmosphere: 0,
  initialGold: 0, initialFragments: 0, initialDrones: 0,
  collectionIntervalHours: 0, operationDurationHours: 0, horizonHours: 24 * 90,
  elitePhase: 2, currentOccupants: {},
}
const isKnown = (id: string) => OPERATOR_MAP.has(id)

function safeClone<T>(val: T): T {
  if (val === undefined || val === null) return val
  try {
    return structuredClone(val)
  } catch {
    return JSON.parse(JSON.stringify(val))
  }
}

export function compileRosterSchedule(workspace: RosterWorkspace, options: Partial<SimulationAssumptions> = {}): CompiledSchedule {
  const sourceWorkspace = safeClone(workspace)
  const assumptions = { ...DEFAULTS, ...safeClone(options), schemaVersion: 1 as const }
  assumptions.operatorMorale = safeClone(options.operatorMorale ?? {})
  assumptions.currentOccupants = safeClone(options.currentOccupants ?? {})
  const diagnostics: CompiledSchedule['diagnostics'] = []
  const invalid = (path: string, message: string) => diagnostics.push({ code: 'INVALID_ASSUMPTION', severity: 'error', path, message })
  if (!Number.isFinite(assumptions.restingThreshold) || assumptions.restingThreshold! < 0 || assumptions.restingThreshold! > 1) invalid('assumptions.restingThreshold', 'Resting threshold must be within 0..1')
  if (!Number.isFinite(assumptions.initialMorale) || assumptions.initialMorale < 0 || assumptions.initialMorale > 24) invalid('assumptions.initialMorale', '初始心情必须为 0–24 的有限数')
  if (!Number.isFinite(assumptions.horizonHours) || assumptions.horizonHours <= 0) invalid('assumptions.horizonHours', '模拟时长必须为正有限数')
  if (!Number.isFinite(assumptions.initialGold) || assumptions.initialGold < 0) invalid('assumptions.initialGold', '初始赤金不能为负数')
  for (const [id, morale] of Object.entries(assumptions.operatorMorale)) if (!Number.isFinite(morale) || morale < 0 || morale > 24) invalid(`assumptions.operatorMorale.${id}`, '干员心情必须为 0–24 的有限数')

  if (assumptions.idleOperators) assumptions.idleOperators = [...new Set(assumptions.idleOperators.map(resolveOperatorCharId))]
  if (assumptions.idleOperators?.some(id => !isKnown(id))) invalid('assumptions.idleOperators', 'Unknown idle operator')
  for (const key of ['rescueThreshold', 'fiammettaThreshold'] as const) if (!Number.isFinite(assumptions[key]) || assumptions[key]! < 0 || assumptions[key]! > 1) invalid(`assumptions.${key}`, 'Threshold must be within 0..1')
  const rawConf = structuredClone(workspace.mainPlan.conf)
  const policies = structuredClone(rawConf) as MowerMainConf
  for (const key of LIST_POLICIES) policies[key] = (rawConf[key] ?? []).map(resolveOperatorCharId)
  const knownPolicyKeys = new Set(['ling_xi', 'free_blacklist', ...LIST_POLICIES])
  for (const key of Object.keys(rawConf)) if (!knownPolicyKeys.has(key)) diagnostics.push({ code: 'UNKNOWN_POLICY', severity: 'warning', path: `mainPlan.conf.${key}`, message: `保留但不执行未知策略 ${key}` })

  const operators: CompiledSchedule['operators'] = {}
  const restPools: CompiledSchedule['restPools'] = []
  const fiammettaPolicies: CompiledSchedule['fiammettaPolicies'] = []
  const runOrderPolicies: CompiledSchedule['runOrderPolicies'] = []
  const rooms = Object.values(workspace.mainPlan.facilities).map((facility) => {
    const freeSlotIndices: number[] = []
    const runCandidates: string[] = []
    const slots = facility.slots.map((slot, slotIndex) => {
      let primaryOperatorId: string | null = null
      if (slot.occupant.kind === 'operator') primaryOperatorId = resolveOperatorCharId(slot.occupant.operatorId)
      if (slot.occupant.kind === 'current') {
        const current = assumptions.currentOccupants[facility.roomId]?.[slotIndex]
        if (current) primaryOperatorId = resolveOperatorCharId(current)
        else diagnostics.push({ code: 'CURRENT_STATE_REQUIRED', severity: 'error', path: `${facility.roomId}.slots.${slotIndex}`, message: 'Current 需要显式当前干员状态' })
      }
      const orderedCandidates = slot.replacements.map(resolveOperatorCharId)
      if (facility.type === 'trading') {
        for (const id of [primaryOperatorId, ...orderedCandidates]) {
          if (id && isUnsupportedTradeOperator(id)) diagnostics.push({ code: 'UNSUPPORTED_SPECIAL_ORDER', severity: 'error', path: facility.roomId + '.slots.' + slotIndex, message: (OPERATOR_MAP.get(id)?.name ?? id) + '：本分支贸易站仅支持但书、龙舌兰特殊订单，请移除此主班或候补。' })
        }
      }
      for (const [candidateIndex, id] of orderedCandidates.entries()) {
        if (!isKnown(id)) diagnostics.push({ code: 'UNKNOWN_OPERATOR', severity: 'warning', path: `${facility.roomId}.slots.${slotIndex}.replacements.${candidateIndex}`, message: `未知干员 ${id}` })
      }
      if (primaryOperatorId && !isKnown(primaryOperatorId)) diagnostics.push({ code: 'UNKNOWN_OPERATOR', severity: 'warning', path: `${facility.roomId}.slots.${slotIndex}.occupant`, message: `未知干员 ${primaryOperatorId}` })
      const isFiammetta = primaryOperatorId ? OPERATOR_MAP.get(primaryOperatorId)?.name === '菲亚梅塔' : false
      const role: CompiledSlot['role'] = slot.occupant.kind === 'free' ? 'free-rest' : isFiammetta ? 'fiammetta' : facility.type === 'dormitory' ? 'dorm-keeper' : 'work'
      if (role === 'free-rest') freeSlotIndices.push(slotIndex)
      if (isFiammetta && primaryOperatorId) fiammettaPolicies.push({ roomId: facility.roomId, slotIndex, operatorId: primaryOperatorId, orderedTargets: [...orderedCandidates] })
      if (facility.type === 'trading') for (const id of orderedCandidates) {
        const name = OPERATOR_MAP.get(id)?.name
        if (name === '但书' || name === '龙舌兰') runCandidates.push(id)
      }
      if (primaryOperatorId) operators[primaryOperatorId] = { operatorId: primaryOperatorId, morale: assumptions.operatorMorale[primaryOperatorId] ?? assumptions.initialMorale, roomId: facility.roomId, slotIndex }
      const slotMeta = (slot as { metadata?: Record<string, unknown> }).metadata
      return { roomId: facility.roomId, slotIndex, occupant: structuredClone(slot.occupant), primaryOperatorId, orderedCandidates, groupId: slot.groupId, role, metadata: slotMeta ? structuredClone(slotMeta) : undefined }
    })
    if (freeSlotIndices.length) restPools.push({ roomId: facility.roomId, capacity: freeSlotIndices.length, freeSlotIndices })
    if (runCandidates.length) runOrderPolicies.push({ roomId: facility.roomId, orderedOperatorIds: runCandidates })
    return { roomId: facility.roomId, type: facility.type, level: facility.level, product: facility.product, capacity: facility.slots.length, slots }
  })
  const defaultsApplied = Object.keys(DEFAULTS).filter((key) => options[key as keyof SimulationAssumptions] === undefined)
  return {
    schemaVersion: 1, rooms, operators, restPools, policies, rawConf, runOrderPolicies,
    fiammettaPolicies, diagnostics, sourceWorkspace,
    assumptions: { ...assumptions, dataVersion: GAME_DATA_VERSION, compilerVersion: '1', levelSource: 'workspace-inferred', importSource: workspace.compatibility.sourceVersion ?? 'workspace', defaultsApplied },
  }
}
