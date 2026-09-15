import { OPERATOR_MAP, OPERATORS, type OperatorRecord } from '../domain/operators'
import { hasRiicTag } from '../domain/riicTags'
import type { MowerRoomId, RosterWorkspace } from '../workbench/model'

export interface SmartDormitoryOptions {
  /** Available operator IDs from pool/inventory. If omitted, uses all recognized operators. */
  candidateOperatorIds?: string[]
  /** Force run even if disable_auto_dorm_keeper is enabled. */
  force?: boolean
}

export interface DormitoryAssignmentReport {
  applied: boolean
  fiammettaRoomId: MowerRoomId | null
  dormitoryKeepers: Record<string, { aoe?: string; single?: string }>
  synergyPlaced: Array<{ operatorId: string; roomId: MowerRoomId; slotIndex: number }>
}

/** Check if operator has an AOE dormitory recovery skill. */
export function isAoeDormKeeper(op: OperatorRecord): boolean {
  return op.skills.some(
    (s) =>
      s.roomType === 'DORMITORY' &&
      (/(?:该宿舍内|宿舍内)(?:所有|除自身以外所有)干员/.test(s.description) ||
        s.buffId.startsWith('dorm_rec_all') ||
        s.buffId.startsWith('dorm_powToRecAll') ||
        s.buffId.startsWith('dorm_hireToRecAll')),
  )
}

/** Check if operator has a single-target dormitory recovery skill. */
export function isSingleDormKeeper(op: OperatorRecord): boolean {
  return op.skills.some(
    (s) =>
      s.roomType === 'DORMITORY' &&
      (/(?:某个干员|指定干员)(?:的心情)?每小时恢复/.test(s.description) ||
        s.buffId.startsWith('dorm_rec_single') ||
        s.buffId === 'dorm_rec_toone[000]'),
  )
}

/** Check if operator has any dormitory recovery skill (AOE, single, or self). */
export function hasDormRecoverySkill(op: OperatorRecord): boolean {
  return op.skills.some(
    (s) => s.roomType === 'DORMITORY' && (/恢复/.test(s.description) || s.buffId.includes('dorm_rec')),
  )
}

/**
 * Automatically applies smart dormitory keepers and synergy placements:
 * 1. Default 2 dorm keepers per dormitory: 1 AOE + 1 Single.
 * 2. If Fiammetta is in roster, places her in the slowest recovery dormitory.
 * 3. Synergy operators without recovery skills (e.g. Durin race) placed in Workshop/Training first, then Dormitory.
 * 4. Honors user override: if conf.disable_auto_dorm_keeper is true and not force, skips auto assignment.
 */
export function applySmartDormitoryPolicy(
  workspace: RosterWorkspace,
  options: SmartDormitoryOptions = {},
): DormitoryAssignmentReport {
  const conf = workspace.mainPlan.conf
  if (conf.disable_auto_dorm_keeper && !options.force) {
    return {
      applied: false,
      fiammettaRoomId: null,
      dormitoryKeepers: {},
      synergyPlaced: [],
    }
  }

  const facilities = workspace.mainPlan.facilities
  const dormIds: MowerRoomId[] = ['dormitory_1', 'dormitory_2', 'dormitory_3', 'dormitory_4']

  // Collect operators already assigned to output rooms or control center
  const assignedWorkingIds = new Set<string>()
  for (const [rId, fac] of Object.entries(facilities)) {
    if (rId.startsWith('dormitory')) continue
    for (const slot of fac.slots) {
      if (slot.occupant.kind === 'operator') {
        assignedWorkingIds.add(slot.occupant.operatorId)
      }
    }
  }

  // Operator pool: candidates if provided, else all operators excluding working operators
  const poolIds = options.candidateOperatorIds && options.candidateOperatorIds.length > 0
    ? options.candidateOperatorIds.filter((id) => !assignedWorkingIds.has(id))
    : OPERATORS.map((o) => o.charId).filter((id) => !assignedWorkingIds.has(id))

  const poolOps = poolIds.map((id) => OPERATOR_MAP.get(id)).filter((o): o is OperatorRecord => Boolean(o))

  // Find AOE and Single dorm keepers
  const aoeCandidates = poolOps.filter(isAoeDormKeeper)
  const singleCandidates = poolOps.filter(isSingleDormKeeper)

  const usedKeepers = new Set<string>()
  const keeperReport: Record<string, { aoe?: string; single?: string }> = {}

  // 1. Check Fiammetta placement
  const hasFiammetta = Array.from(assignedWorkingIds).includes('char_300_phenxi') ||
    dormIds.some((dId) => facilities[dId].slots.some((s) => s.occupant.kind === 'operator' && s.occupant.operatorId === 'char_300_phenxi'))

  let fiammettaRoomId: MowerRoomId | null = null
  if (hasFiammetta) {
    // Find slowest dormitory (lowest level, or dormitory_4 as tie-breaker)
    let slowestRoom: MowerRoomId = 'dormitory_4'
    let lowestLevel = 999
    for (const dId of dormIds) {
      const lvl = facilities[dId]?.level ?? 1
      if (lvl < lowestLevel) {
        lowestLevel = lvl
        slowestRoom = dId
      }
    }
    fiammettaRoomId = slowestRoom

    // Remove Fiammetta from any other room if present
    for (const dId of dormIds) {
      if (dId !== slowestRoom) {
        for (const slot of facilities[dId].slots) {
          if (slot.occupant.kind === 'operator' && slot.occupant.operatorId === 'char_300_phenxi') {
            slot.occupant = { kind: 'free' }
          }
        }
      }
    }

    // Place Fiammetta in slowest room slot 0
    const targetRoom = facilities[slowestRoom]
    if (targetRoom && targetRoom.slots.length > 0 && targetRoom.slots[0]) {
      targetRoom.slots[0].occupant = { kind: 'operator', operatorId: 'char_300_phenxi' }
    }
  }

  // 2. Assign 2 dorm keepers per dormitory (1 AOE + 1 Single)
  for (const dId of dormIds) {
    const fac = facilities[dId]
    keeperReport[dId] = {}

    // Find available AOE keeper
    const aoeOp = aoeCandidates.find((o) => !usedKeepers.has(o.charId))
    // Find available Single keeper
    const singleOp = singleCandidates.find((o) => !usedKeepers.has(o.charId) && o.charId !== aoeOp?.charId)

    // Determine target slot indices: if Fiammetta is in slot 0, use slots 1 and 2
    const isFiamRoom = dId === fiammettaRoomId
    const aoeSlotIndex = isFiamRoom ? 1 : 0
    const singleSlotIndex = isFiamRoom ? 2 : 1

    if (aoeOp && fac.slots[aoeSlotIndex]) {
      fac.slots[aoeSlotIndex].occupant = { kind: 'operator', operatorId: aoeOp.charId }
      usedKeepers.add(aoeOp.charId)
      keeperReport[dId].aoe = aoeOp.charId
    }

    if (singleOp && fac.slots[singleSlotIndex]) {
      fac.slots[singleSlotIndex].occupant = { kind: 'operator', operatorId: singleOp.charId }
      usedKeepers.add(singleOp.charId)
      keeperReport[dId].single = singleOp.charId
    }
  }

  // 3. Synergy operators without recovery skills (e.g. Durin race)
  const synergyReport: Array<{ operatorId: string; roomId: MowerRoomId; slotIndex: number }> = []
  const durinSynergyOps = poolOps.filter(
    (o) => hasRiicTag(o, 'durin') && !hasDormRecoverySkill(o) && !usedKeepers.has(o.charId),
  )

  const auxiliaryRooms: MowerRoomId[] = ['factory', 'train', 'contact']
  for (const op of durinSynergyOps) {
    let placed = false

    // Try auxiliary rooms first (factory, train, contact)
    for (const auxId of auxiliaryRooms) {
      const fac = facilities[auxId]
      if (!fac) continue
      for (let sIdx = 0; sIdx < fac.slots.length; sIdx++) {
        const slot = fac.slots[sIdx]
        if (slot && (slot.occupant.kind === 'empty' || slot.occupant.kind === 'free')) {
          slot.occupant = { kind: 'operator', operatorId: op.charId }
          usedKeepers.add(op.charId)
          synergyReport.push({ operatorId: op.charId, roomId: auxId, slotIndex: sIdx })
          placed = true
          break
        }
      }
      if (placed) break
    }

    // If auxiliary rooms full, place into dormitory empty slot
    if (!placed) {
      for (const dId of dormIds) {
        const fac = facilities[dId]
        if (!fac) continue
        for (let sIdx = 2; sIdx < fac.slots.length; sIdx++) {
          const slot = fac.slots[sIdx]
          if (slot && (slot.occupant.kind === 'empty' || slot.occupant.kind === 'free')) {
            slot.occupant = { kind: 'operator', operatorId: op.charId }
            usedKeepers.add(op.charId)
            synergyReport.push({ operatorId: op.charId, roomId: dId, slotIndex: sIdx })
            placed = true
            break
          }
        }
        if (placed) break
      }
    }
  }

  return {
    applied: true,
    fiammettaRoomId,
    dormitoryKeepers: keeperReport,
    synergyPlaced: synergyReport,
  }
}
