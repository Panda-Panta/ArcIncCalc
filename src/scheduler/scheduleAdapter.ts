import { OPERATOR_MAP } from '../domain/operators'
import { resolveOperatorCharId } from '../workbench/compat/mowerJson'
import type { CompiledSchedule } from './types'
import type { RuntimeBed, RuntimeConfig, RuntimePosition } from './rosterRuntime'

const SHIFT_RUN_OPERATOR_NAMES = new Set(['但书', '龙舌兰', '佩佩'])

/**
 * Returns true if an operator is a shift-run dedicated operator (Proviso, Tequila, Pepe).
 */
export function isShiftRunOperator(operatorId: string): boolean {
  const charId = resolveOperatorCharId(operatorId)
  const name = OPERATOR_MAP.get(charId)?.name
  return name ? SHIFT_RUN_OPERATOR_NAMES.has(name) : false
}

/**
 * Pure function adapter converting a CompiledSchedule to a RuntimeConfig.
 *
 * Rules:
 * 1. General candidate lists (RuntimePosition.candidates) strictly EXCLUDE shift-run dedicated operators
 *    (Proviso, Tequila, Pepe).
 * 2. schedule.runOrderPolicies retains its exact original order.
 * 3. RuntimeConfig.excludedCandidates includes all shift-run dedicated candidates.
 * 4. Fiammetta swap policy is mapped to runtime fiammetta config.
 * 5. Dormitory Free slots are mapped to runtime beds.
 * 6. Dorm-keepers without candidates are marked permanent to avoid invalid shifts.
 * 7. Does NOT mutate the input CompiledSchedule.
 */
export function compiledScheduleToRuntimeConfig(schedule: CompiledSchedule): RuntimeConfig {
  const positions: RuntimePosition[] = []
  const shiftRunIds = new Set<string>()

  // Register known shift-run IDs
  for (const name of SHIFT_RUN_OPERATOR_NAMES) {
    const id = resolveOperatorCharId(name)
    if (id) shiftRunIds.add(id)
  }

  // Also collect any from runOrderPolicies
  for (const policy of schedule.runOrderPolicies) {
    for (const id of policy.orderedOperatorIds) {
      shiftRunIds.add(id)
    }
  }

  for (const room of schedule.rooms) {
    const isDorm = room.type === 'dormitory'
    for (const slot of room.slots) {
      if (!slot.primaryOperatorId) continue

      const primary = slot.primaryOperatorId
      const isDormKeeper = slot.role === 'dorm-keeper'
      const isFiammetta = slot.role === 'fiammetta'

      // General candidates must exclude shift-run operators (Proviso, Tequila, Pepe)
      let candidates: string[]
      if (isDormKeeper || isFiammetta) {
        candidates = []
      } else {
        candidates = slot.orderedCandidates.filter(id => !isShiftRunOperator(id))
      }

      const exhaustRequired = Boolean(schedule.policies.exhaust_require?.includes(primary))
      const restToFull = Boolean(schedule.policies.rest_in_full?.includes(primary))
      const restingPriority = schedule.policies.resting_priority?.includes(primary)
        || schedule.policies.ope_resting_priority?.includes(primary)
        ? 'high'
        : undefined

      const position: RuntimePosition = {
        id: `${room.roomId}_${slot.slotIndex}`,
        roomId: room.roomId,
        primary,
        candidates,
        group: slot.groupId?.trim() ? slot.groupId.trim() : undefined,
        dormitory: isDorm,
        permanent: (isDormKeeper && candidates.length === 0) || undefined,
        exhaustRequired: exhaustRequired || undefined,
        restToFull: restToFull || undefined,
        restingPriority,
      }

      positions.push(position)
    }
  }

  // Beds from restPools
  const beds: RuntimeBed[] = []
  for (const pool of schedule.restPools) {
    for (const [freeIndex, idx] of pool.freeSlotIndices.entries()) {
      beds.push({
        id: `${pool.roomId}_${idx}`,
        roomId: pool.roomId,
        // Mower reserves the first Free slot in each dormitory as its VIP bed.
        vip: freeIndex === 0,
      })
    }
  }

  // Initial morale
  const initialMorale: Record<string, number> = {}
  for (const [id, st] of Object.entries(schedule.operators)) {
    initialMorale[id] = st.morale
  }
  if (schedule.assumptions.operatorMorale) {
    for (const [id, m] of Object.entries(schedule.assumptions.operatorMorale)) {
      initialMorale[id] = m
    }
  }

  // Fiammetta policy
  let fiammetta: RuntimeConfig['fiammetta'] = undefined
  if (schedule.fiammettaPolicies.length > 0) {
    const fp = schedule.fiammettaPolicies[0]!
    fiammetta = {
      operatorId: fp.operatorId,
      orderedTargets: [...fp.orderedTargets],
      threshold: 21.6,
    }
  }

  // Preserved runOrderPolicies (original order maintained)
  const runOrderPolicies = schedule.runOrderPolicies.map(p => ({
    roomId: p.roomId,
    orderedOperatorIds: [...p.orderedOperatorIds],
  }))

  return {
    positions,
    beds,
    initialMorale,
    fiammetta,
    excludedCandidates: Array.from(shiftRunIds),
    runOrderPolicies,
  }
}

export const scheduleToRuntimeConfig = compiledScheduleToRuntimeConfig
