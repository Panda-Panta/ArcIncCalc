import type { MowerRoomId, RosterWorkspace } from '../workbench/model'
import { resolveOperatorCharId as resolveId } from '../workbench/compat/mowerJson'
import { type OperatorInventory } from '../domain/operatorInventory'
import {
  ATOMIC_UNITS,
  HIGH_EFFICIENCY_SINGLETONS,
} from './riicAtomicUnits'
import { assignBackups } from './rosterDraft'
import { placePendantOperator } from '../scheduler/smartDormitoryPolicy'

export interface ReplacementResult {
  workspace: RosterWorkspace
  swappedCount: number
  logs: string[]
}

/**
 * Stage 3 Global Optimization:
 * 1. Global audit of all groups & singletons in production rooms (manufacture, trading).
 * 2. If a pendant operator (e.g. Minimalist under 2-power) occupies a production room,
 *    relocate it to non-production facilities (factory, train, or lowest recovery dorm slot).
 * 3. Compare in-service units with unassigned combinations or singletons of equal size.
 *    If an unassigned combination/singleton has strictly higher per-capita output, swap it in.
 * 4. Loop iteratively until convergence (no further beneficial replacement targets).
 */
export function runGlobalPerCapitaReplacement(
  base: RosterWorkspace,
  inventory: OperatorInventory,
  options: {
    powerCount?: number
    lockedPositions?: Set<string>
    lockedOperators?: Set<string>
  } = {},
): ReplacementResult {
  const ws = structuredClone(base)
  const logs: string[] = []
  let swappedCount = 0

  const lockedPositions = options.lockedPositions ?? new Set<string>()
  const lockedOperators = options.lockedOperators ?? new Set<string>()

  const powerRooms = Object.values(ws.mainPlan.facilities).filter((r) => r.type === 'power')
  const powerCount = options.powerCount ?? powerRooms.length

  const ownedNames = new Set(
    inventory.operators.filter((o) => o.matchesMaximumSkills).map((o) => o.name),
  )

  // ----------------------------------------------------
  // Step 1: Detect and Relocate Misplaced Pendants
  // ----------------------------------------------------
  // Minimalist (至简) check under 2-power constraint:
  if (powerCount === 2) {
    for (const [rId, fac] of Object.entries(ws.mainPlan.facilities)) {
      if (fac.type !== 'manufacture') continue
      for (let sIdx = 0; sIdx < fac.slots.length; sIdx++) {
        const slot = fac.slots[sIdx]!
        if (
          slot.occupant.kind === 'operator' &&
          resolveId(slot.occupant.operatorId) === resolveId('至简') &&
          !lockedPositions.has(`${rId}:${sIdx}`) &&
          !lockedOperators.has(resolveId('至简'))
        ) {
          // Prohibited from manufacture! Remove and place in auxiliary
          slot.occupant = { kind: 'empty' }
          slot.groupId = null
          slot.replacements = []
          logs.push(`[挂件移位] 2电站限制：检测到至简入驻制造站 ${rId}，移出制造站并安置于非生产设施。`)
          const pendantResult = placePendantOperator(ws, '至简', '感知信息挂件', inventory)
          if (pendantResult.placed) {
            logs.push(`[挂件落位] 至简成功安置于 ${pendantResult.roomId} 槽位 ${pendantResult.slotIndex}。`)
          }
          swappedCount++
        }
      }
    }
  }

  // ----------------------------------------------------
  // Step 2: Global Per-Capita Optimization Loop
  // ----------------------------------------------------
  const MAX_ITERATIONS = 10
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false

    // Collect currently occupied operators across the entire base
    const occupied = new Set<string>()
    for (const fac of Object.values(ws.mainPlan.facilities)) {
      for (const slot of fac.slots) {
        if (slot.occupant.kind === 'operator') {
          occupied.add(resolveId(slot.occupant.operatorId))
        }
      }
    }

    // Inspect manufacture and trading rooms
    const productionRooms = Object.values(ws.mainPlan.facilities).filter(
      (r) => r.type === 'manufacture' || r.type === 'trading',
    )

    for (const room of productionRooms) {
      const isManufacture = room.type === 'manufacture'
      const product = isManufacture ? room.product : 'money'
      const cap = room.slots.length

      // Group consecutive or related slots in this room
      // Identify current occupants in this room
      const currentOps: { slotIdx: number; name: string; id: string }[] = []
      for (let idx = 0; idx < cap; idx++) {
        const slot = room.slots[idx]!
        if (slot.occupant.kind === 'operator') {
          const charId = resolveId(slot.occupant.operatorId)
          const opRecord = inventory.operators.find((o) => o.charId === charId)
          currentOps.push({ slotIdx: idx, name: opRecord?.name ?? charId, id: charId })
        }
      }

      if (currentOps.length === 0) continue

      // Estimate current room's average per-capita output
      const roomGroupId = room.slots.find((s) => s.groupId)?.groupId
      const activeUnit = ATOMIC_UNITS.find(
        (u) => roomGroupId?.includes(u.name) || u.coreMembers.every((m) => currentOps.some((co) => co.name === m.name)),
      )

      let currentPerCapita = activeUnit?.perCapitaOutput ?? 30 // default singleton baseline ~30%

      // Check available candidate atomic units
      const candidates = ATOMIC_UNITS.filter((u) => {
        if (u.preferredFacilityType !== room.type) return false
        if (isManufacture && u.preferredProduct !== 'any' && u.preferredProduct !== product) return false
        if (u.perCapitaOutput === undefined || u.perCapitaOutput <= currentPerCapita) return false
        if (u.coreMembers.length > cap) return false

        // Check if all core members are owned and either free or currently in this room
        const currentRoomOpIds = new Set(currentOps.map((co) => co.id))
        for (const m of u.coreMembers) {
          if (!ownedNames.has(m.name)) return false
          const mId = resolveId(m.name)
          if (lockedOperators.has(mId)) return false
          if (occupied.has(mId) && !currentRoomOpIds.has(mId)) return false
        }
        return true
      }).sort((a, b) => (b.perCapitaOutput ?? 0) - (a.perCapitaOutput ?? 0))

      if (candidates.length > 0) {
        const bestCandidate = candidates[0]!
        // Check if any slot in this room is locked
        const hasLockedSlot = Array.from({ length: cap }, (_, idx) =>
          lockedPositions.has(`${room.roomId}:${idx}`) || (room.slots[idx]?.occupant.kind === 'operator' && lockedOperators.has(resolveId(room.slots[idx]!.occupant.operatorId))),
        ).some(Boolean)

        if (!hasLockedSlot) {
          logs.push(
            `[全局置换] 设施 ${room.roomId}：当前人均产出 ${currentPerCapita}% 替换为 ${bestCandidate.name} (人均产出 ${bestCandidate.perCapitaOutput}%)`,
          )

          // Clear previous members from this room
          for (let sIdx = 0; sIdx < cap; sIdx++) {
            room.slots[sIdx]!.occupant = { kind: 'empty' }
            room.slots[sIdx]!.groupId = null
            room.slots[sIdx]!.replacements = []
          }

          // Place candidate core members
          const newGroupId = `优化_${bestCandidate.name}`
          bestCandidate.coreMembers.forEach((m, idx) => {
            if (idx < cap) {
              const mId = resolveId(m.name)
              room.slots[idx]!.occupant = { kind: 'operator', operatorId: mId }
              room.slots[idx]!.groupId = newGroupId
              occupied.add(mId)
            }
          })

          // Fill remaining slots in this room if cap > coreMembers.length
          for (let sIdx = bestCandidate.coreMembers.length; sIdx < cap; sIdx++) {
            const pool = isManufacture
              ? (product === 'exp' ? HIGH_EFFICIENCY_SINGLETONS.expManufacture : HIGH_EFFICIENCY_SINGLETONS.goldManufacture)
              : HIGH_EFFICIENCY_SINGLETONS.trading
            const freeSingleton = pool.find((name) => {
              const id = resolveId(name)
              return ownedNames.has(name) && !occupied.has(id) && !lockedOperators.has(id)
            })
            if (freeSingleton) {
              const sId = resolveId(freeSingleton)
              room.slots[sIdx]!.occupant = { kind: 'operator', operatorId: sId }
              room.slots[sIdx]!.groupId = `${newGroupId}_散件`
              occupied.add(sId)
            }
          }

          // Apply unit conf policy if any
          if (bestCandidate.confPolicy) {
            if (bestCandidate.confPolicy.exhaustRequire) {
              for (const n of bestCandidate.confPolicy.exhaustRequire) {
                if (!ws.mainPlan.conf.exhaust_require.includes(n)) ws.mainPlan.conf.exhaust_require.push(n)
              }
            }
            if (bestCandidate.confPolicy.restInFull) {
              for (const n of bestCandidate.confPolicy.restInFull) {
                if (!ws.mainPlan.conf.rest_in_full.includes(n)) ws.mainPlan.conf.rest_in_full.push(n)
              }
            }
          }

          swappedCount++
          changed = true
          break
        }
      }
    }

    if (!changed) break
  }

  // ----------------------------------------------------
  // Step 2.5: Ensure all slots in production rooms are filled
  // ----------------------------------------------------
  const occupiedAll = new Set<string>()
  for (const fac of Object.values(ws.mainPlan.facilities)) {
    for (const slot of fac.slots) {
      if (slot.occupant.kind === 'operator') {
        occupiedAll.add(resolveId(slot.occupant.operatorId))
      }
    }
  }

  const productionRoomsAll = Object.values(ws.mainPlan.facilities).filter(
    (r) => r.type === 'manufacture' || r.type === 'trading',
  )
  for (const room of productionRoomsAll) {
    const isManufacture = room.type === 'manufacture'
    const product = isManufacture ? room.product : 'money'
    const cap = room.slots.length
    for (let sIdx = 0; sIdx < cap; sIdx++) {
      const slot = room.slots[sIdx]!
      if (slot.occupant.kind !== 'operator' && !lockedPositions.has(`${room.roomId}:${sIdx}`)) {
        const pool = isManufacture
          ? (product === 'exp' ? HIGH_EFFICIENCY_SINGLETONS.expManufacture : HIGH_EFFICIENCY_SINGLETONS.goldManufacture)
          : HIGH_EFFICIENCY_SINGLETONS.trading
        const freeSingleton = pool.find((name) => {
          const id = resolveId(name)
          return ownedNames.has(name) && !occupiedAll.has(id) && !lockedOperators.has(id)
        })
        if (freeSingleton) {
          const sId = resolveId(freeSingleton)
          slot.occupant = { kind: 'operator', operatorId: sId }
          slot.groupId = `散件_${room.roomId}`
          occupiedAll.add(sId)
        }
      }
    }
  }

  // ----------------------------------------------------
  // Step 3: Backups & Validity Pass
  // ----------------------------------------------------
  const unbackedPositions: { roomId: MowerRoomId; slotIndex: number; operatorId: string }[] = []
  for (const [rId, fac] of Object.entries(ws.mainPlan.facilities)) {
    if (fac.type === 'dormitory') continue
    fac.slots.forEach((slot, sIdx) => {
      if (slot.occupant.kind === 'operator' && slot.replacements.length === 0) {
        unbackedPositions.push({
          roomId: rId as MowerRoomId,
          slotIndex: sIdx,
          operatorId: resolveId(slot.occupant.operatorId),
        })
      }
    })
  }

  if (unbackedPositions.length > 0) {
    assignBackups(ws, inventory, unbackedPositions)
  }

  // Fallback assignment for any remaining unbacked slots in working facilities
  const currentlyReserved = new Set(
    Object.values(ws.mainPlan.facilities).flatMap((r) =>
      r.slots.flatMap((s) => [
        ...(s.occupant.kind === 'operator' ? [resolveId(s.occupant.operatorId)] : []),
        ...s.replacements.map(resolveId),
      ]),
    ),
  )

  for (const room of Object.values(ws.mainPlan.facilities)) {
    if (['manufacture', 'trading', 'power', 'central', 'meeting', 'factory', 'train'].includes(room.type)) {
      for (const slot of room.slots) {
        if (slot.occupant.kind === 'operator' && slot.replacements.length === 0) {
          const fallbackOp = inventory.operators.find(
            (o) =>
              o.matchesMaximumSkills &&
              !currentlyReserved.has(o.charId) &&
              !lockedOperators.has(o.charId) &&
              o.name !== '菲亚梅塔',
          )
          if (fallbackOp) {
            slot.replacements = [fallbackOp.charId]
            currentlyReserved.add(fallbackOp.charId)
          }
        }
      }
    }
  }

  return { workspace: ws, swappedCount, logs }
}
