import { OPERATOR_MAP, OPERATORS, type OperatorRecord } from '../domain/operators'
import { compileOperatorInventory, type OwnedOperatorInput } from '../domain/operatorInventory'
import { resolveOperatorCharId as resolveId } from '../workbench/compat/mowerJson'
import { hasRiicTag } from '../domain/riicTags'
import type { MowerRoomId, RosterWorkspace } from '../workbench/model'

export interface SmartDormitoryOptions {
  /** Available operator IDs or names from pool/inventory. If omitted, uses all recognized operators. */
  candidateOperatorIds?: string[]
  /** Owned operator inventory entries with elite and level information. */
  entries?: readonly OwnedOperatorInput[]
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
      (/(?:某个干员|指定干员|一名干员)(?:的心情)?每小时恢复/.test(s.description) ||
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
 * 5. Fills remaining unassigned slots in dormitories with 'free' so resting operators can rest.
 */
function removeOperatorEverywhere(
  workspace: RosterWorkspace,
  charIdOrName: string,
  excludeRoomId?: MowerRoomId,
  excludeSlotIndex?: number,
): void {
  const targetId = resolveId(charIdOrName)
  for (const [rId, fac] of Object.entries(workspace.mainPlan.facilities)) {
    fac.slots.forEach((slot, sIdx) => {
      if (rId === excludeRoomId && sIdx === excludeSlotIndex) return
      if (slot.occupant.kind === 'operator' && resolveId(slot.occupant.operatorId) === targetId) {
        slot.occupant = rId.startsWith('dormitory') ? { kind: 'free' } : { kind: 'empty' }
        if (rId.startsWith('dormitory')) {
          slot.replacements = []
        }
      }
      // Also remove from replacements if present (except if slot is Fiammetta swap targets in dorm)
      if (slot.replacements.length > 0) {
        const isFiam = slot.occupant.kind === 'operator' && resolveId(slot.occupant.operatorId) === 'char_300_phenxi'
        if (!(rId.startsWith('dormitory') && isFiam)) {
          slot.replacements = slot.replacements.filter((rep) => resolveId(rep) !== targetId)
        }
      }
    })
  }
}

/**
 * Automatically applies smart dormitory keepers and synergy placements:
 * 1. Default 2 dorm keepers per dormitory: 1 AOE + 1 Single.
 * 2. If Fiammetta is in roster, places her in the slowest recovery dormitory.
 * 3. Synergy operators without recovery skills (e.g. Durin race) placed in Workshop/Training first, then Dormitory.
 * 4. Honors user override: if conf.disable_auto_dorm_keeper is true and not force, skips auto assignment.
 * 5. Fills remaining unassigned slots in dormitories with 'free' so resting operators can rest.
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

  // Find if Fiammetta exists in the incoming workspace (and capture her replacement swap targets)
  let existingFiamSlot: { roomId: MowerRoomId; slotIndex: number; replacements: string[] } | null = null
  for (const [rId, fac] of Object.entries(facilities)) {
    for (let sIdx = 0; sIdx < fac.slots.length; sIdx++) {
      const slot = fac.slots[sIdx]
      if (slot?.occupant.kind === 'operator' && resolveId(slot.occupant.operatorId) === 'char_300_phenxi') {
        existingFiamSlot = { roomId: rId as MowerRoomId, slotIndex: sIdx, replacements: [...slot.replacements] }
        break
      }
    }
    if (existingFiamSlot) break
  }

  // 1. Determine Fiammetta placement if present in incoming workspace or candidates
  const hasFiammetta = Boolean(existingFiamSlot) ||
    Boolean(options.candidateOperatorIds?.some((id) => resolveId(id) === 'char_300_phenxi')) ||
    Boolean(options.entries?.some((e) => resolveId(e.operator) === 'char_300_phenxi'))

  let fiammettaRoomId: MowerRoomId | null = null
  if (hasFiammetta) {
    // Find slowest dormitory (lowest level, or dormitory_4 as tie-breaker)
    let slowestRoom: MowerRoomId = 'dormitory_4'
    let lowestLevel = 999
    for (const dId of dormIds) {
      const lvl = facilities[dId]?.level ?? 1
      if (lvl <= lowestLevel) {
        lowestLevel = lvl
        slowestRoom = dId
      }
    }
    fiammettaRoomId = slowestRoom

    // Clear Fiammetta from everywhere else in the base
    removeOperatorEverywhere(workspace, 'char_300_phenxi', slowestRoom, 0)

    // Place Fiammetta in slowest room slot 0 with her replacements transferred
    const targetRoom = facilities[slowestRoom]
    if (targetRoom && targetRoom.slots.length > 0 && targetRoom.slots[0]) {
      targetRoom.slots[0].occupant = { kind: 'operator', operatorId: 'char_300_phenxi' }
      if (existingFiamSlot && existingFiamSlot.replacements.length > 0) {
        targetRoom.slots[0].replacements = existingFiamSlot.replacements
      }
    }
  }

  // Reset any non-Fiammetta unpinned dormitory slots to clean free state before re-assignment
  for (const dId of dormIds) {
    const fac = facilities[dId]
    if (!fac) continue
    for (let sIdx = 0; sIdx < fac.slots.length; sIdx++) {
      if (dId === fiammettaRoomId && sIdx === 0) continue
      const slot = fac.slots[sIdx]
      if (slot && !slot.groupId) {
        slot.occupant = { kind: 'free' }
        slot.replacements = []
      }
    }
  }

  // Collect operators already assigned to output rooms or control center or Fiammetta
  const assignedWorkingIds = new Set<string>()
  for (const [rId, fac] of Object.entries(facilities)) {
    if (rId.startsWith('dormitory')) continue
    for (const slot of fac.slots) {
      if (slot.occupant.kind === 'operator') {
        assignedWorkingIds.add(resolveId(slot.occupant.operatorId))
      }
      for (const rep of slot.replacements) {
        assignedWorkingIds.add(resolveId(rep))
      }
    }
  }
  if (fiammettaRoomId) {
    assignedWorkingIds.add('char_300_phenxi')
  }

  // If owned entries are provided, compile them to check actually unlocked skills
  const ownedMap = options.entries ? compileOperatorInventory(options.entries) : null
  const ownedOps = ownedMap && ownedMap.valid ? new Map(ownedMap.operators.map(o => [o.charId, o])) : null

  // Operator pool: candidates if provided, else all operators excluding working operators
  const poolIds = (options.candidateOperatorIds && options.candidateOperatorIds.length > 0)
    ? options.candidateOperatorIds.map(resolveId).filter((id) => !assignedWorkingIds.has(id))
    : (options.entries && options.entries.length > 0)
      ? options.entries.map(e => resolveId(e.operator)).filter((id) => !assignedWorkingIds.has(id))
      : OPERATORS.map((o) => o.charId).filter((id) => !assignedWorkingIds.has(id))

  const uniquePoolIds = Array.from(new Set(poolIds))
  const poolOps = uniquePoolIds.map((id) => OPERATOR_MAP.get(id)).filter((o): o is OperatorRecord => Boolean(o))

  // Find AOE and Single dorm keepers considering unlocked skills if owned inventory was supplied
  const isCandidateAoe = (op: OperatorRecord): boolean => {
    if (ownedOps) {
      const owned = ownedOps.get(op.charId)
      if (!owned) return false
      return owned.skills.some(
        (s) =>
          s.roomType === 'DORMITORY' &&
          (/(?:该宿舍内|宿舍内)(?:所有|除自身以外所有)干员/.test(s.description) ||
            s.buffId.startsWith('dorm_rec_all') ||
            s.buffId.startsWith('dorm_powToRecAll') ||
            s.buffId.startsWith('dorm_hireToRecAll')),
      )
    }
    return isAoeDormKeeper(op)
  }

  const isCandidateSingle = (op: OperatorRecord): boolean => {
    if (ownedOps) {
      const owned = ownedOps.get(op.charId)
      if (!owned) return false
      return owned.skills.some(
        (s) =>
          s.roomType === 'DORMITORY' &&
          (/(?:某个干员|指定干员|一名干员)(?:的心情)?每小时恢复/.test(s.description) ||
            s.buffId.startsWith('dorm_rec_single') ||
            s.buffId === 'dorm_rec_toone[000]'),
      )
    }
    return isSingleDormKeeper(op)
  }

  const aoeCandidates = poolOps.filter(isCandidateAoe)
  const singleCandidates = poolOps.filter(isCandidateSingle)

  const usedKeepers = new Set<string>()
  if (fiammettaRoomId) {
    usedKeepers.add('char_300_phenxi')
  }
  const keeperReport: Record<string, { aoe?: string; single?: string }> = {}

  // 2. Assign 2 dorm keepers per dormitory (1 AOE + 1 Single)
  for (const dId of dormIds) {
    const fac = facilities[dId]
    keeperReport[dId] = {}

    // Find available AOE keeper
    const aoeOp = aoeCandidates.find((o) => !usedKeepers.has(o.charId) && !assignedWorkingIds.has(o.charId))
    // Find available Single keeper
    const singleOp = singleCandidates.find(
      (o) => !usedKeepers.has(o.charId) && !assignedWorkingIds.has(o.charId) && o.charId !== aoeOp?.charId,
    )

    // Determine target slot indices: if Fiammetta is in slot 0, use slots 1 and 2
    const isFiamRoom = dId === fiammettaRoomId
    const aoeSlotIndex = isFiamRoom ? 1 : 0
    const singleSlotIndex = isFiamRoom ? 2 : 1

    if (aoeOp && fac.slots[aoeSlotIndex]) {
      removeOperatorEverywhere(workspace, aoeOp.charId, dId, aoeSlotIndex)
      fac.slots[aoeSlotIndex].occupant = { kind: 'operator', operatorId: aoeOp.charId }
      fac.slots[aoeSlotIndex].replacements = []
      usedKeepers.add(aoeOp.charId)
      assignedWorkingIds.add(aoeOp.charId)
      keeperReport[dId].aoe = aoeOp.charId
    }

    if (singleOp && fac.slots[singleSlotIndex]) {
      removeOperatorEverywhere(workspace, singleOp.charId, dId, singleSlotIndex)
      fac.slots[singleSlotIndex].occupant = { kind: 'operator', operatorId: singleOp.charId }
      fac.slots[singleSlotIndex].replacements = []
      usedKeepers.add(singleOp.charId)
      assignedWorkingIds.add(singleOp.charId)
      keeperReport[dId].single = singleOp.charId
    }

    // Fill remaining unassigned slots in dormitory with 'free' so resting workers have beds
    for (let sIdx = 0; sIdx < fac.slots.length; sIdx++) {
      const slot = fac.slots[sIdx]
      if (slot && (slot.occupant.kind === 'empty' || !slot.groupId)) {
        if (slot.occupant.kind === 'empty') {
          slot.occupant = { kind: 'free' }
        }
      }
    }
  }

  // 3. Synergy operators without recovery skills (e.g. Durin race)
  const synergyReport: Array<{ operatorId: string; roomId: MowerRoomId; slotIndex: number }> = []
  const durinSynergyOps = poolOps.filter(
    (o) => hasRiicTag(o, 'durin') && !hasDormRecoverySkill(o) && !usedKeepers.has(o.charId) && !assignedWorkingIds.has(o.charId),
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
          removeOperatorEverywhere(workspace, op.charId, auxId, sIdx)
          slot.occupant = { kind: 'operator', operatorId: op.charId }
          usedKeepers.add(op.charId)
          assignedWorkingIds.add(op.charId)
          synergyReport.push({ operatorId: op.charId, roomId: auxId, slotIndex: sIdx })
          placed = true
          break
        }
      }
      if (placed) break
    }

    // If auxiliary rooms full, place into dormitory free slot (index >= 2)
    if (!placed) {
      for (const dId of dormIds) {
        const fac = facilities[dId]
        if (!fac) continue
        const startIdx = dId === fiammettaRoomId ? 3 : 2
        for (let sIdx = startIdx; sIdx < fac.slots.length; sIdx++) {
          const slot = fac.slots[sIdx]
          if (slot && (slot.occupant.kind === 'empty' || slot.occupant.kind === 'free')) {
            removeOperatorEverywhere(workspace, op.charId, dId, sIdx)
            slot.occupant = { kind: 'operator', operatorId: op.charId }
            usedKeepers.add(op.charId)
            assignedWorkingIds.add(op.charId)
            synergyReport.push({ operatorId: op.charId, roomId: dId, slotIndex: sIdx })
            placed = true
            break
          }
        }
        if (placed) break
      }
    }
  }

  // Final invariant enforcement across all dormitories:
  // Any slot that is not a recognized keeper/Fiammetta/synergy operator should be a valid free bed
  for (const dId of dormIds) {
    const fac = facilities[dId]
    if (!fac) continue
    for (const slot of fac.slots) {
      if (slot.occupant.kind === 'empty') {
        slot.occupant = { kind: 'free' }
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
