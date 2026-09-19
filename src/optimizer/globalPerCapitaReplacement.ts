import { isUnsupportedTradeOperator } from '../domain/shiftRunPolicy'
import { configureRunOrder } from './configureRunOrder'
import type { MowerRoomId, RosterWorkspace } from '../workbench/model'
import { resolveOperatorCharId as resolveId } from '../workbench/compat/mowerJson'
import { type OperatorInventory } from '../domain/operatorInventory'
import {
  ATOMIC_UNITS,
  HIGH_EFFICIENCY_SINGLETONS,
  ALL_ATOMIC_CORE_NAMES,
  type AtomicUnit,
} from './riicAtomicUnits'
import { placePendantOperator } from '../scheduler/smartDormitoryPolicy'
import { isShiftRunOperator } from '../scheduler/scheduleAdapter'

export interface ReplacementResult {
  workspace: RosterWorkspace
  swappedCount: number
  score?: number
  logs: string[]
}

export interface ReplacementOptions {
  powerCount?: number
  lockedPositions?: Set<string>
  lockedOperators?: Set<string>
  baselineScore?: number
  evaluator?: (workspace: RosterWorkspace) => number
}

function isPendantOperator(name: string, ws: RosterWorkspace): boolean {
  const allFacs = Object.values(ws.mainPlan.facilities)
  const hasPozemka = allFacs.some((f) =>
    f.slots.some((s) => s.occupant.kind === 'operator' && resolveId(s.occupant.operatorId) === resolveId('鸿雪')),
  )
  if (hasPozemka && ['至简', '褐果', '杜林', '桃金娘', '黑', '绮良'].includes(name)) {
    return true
  }

  const hasRosmontis = allFacs.some((f) =>
    f.slots.some((s) => s.occupant.kind === 'operator' && resolveId(s.occupant.operatorId) === resolveId('迷迭香')),
  )
  if (hasRosmontis && ['絮雨', '爱丽丝', '车尔尼', '琴柳', '黑键'].includes(name)) {
    return true
  }

  const hasWeedy = allFacs.some((f) =>
    f.slots.some((s) => s.occupant.kind === 'operator' && resolveId(s.occupant.operatorId) === resolveId('温蒂')),
  )
  if (hasWeedy && ['Lancet-2', '承曦格雷伊', '森蚺'].includes(name)) {
    return true
  }

  return false
}

/**
 * Stage 3 Global Optimization (Rules 1, 2, 3, 5, 6):
 * 1. Check powerCount: if powerCount <= 2, Minimalist (至简) is strictly prohibited from manufacture.
 * 2. Globally inspect all units and singletons in production rooms (manufacture, trading).
 * 3. Match candidate replacements of the EXACT SAME HEADCOUNT (1-to-1, 2-to-2, 3-to-3).
 * 4. If any operator being swapped out is a pendant, relocate them to non-production facilities
 *    (factory -> train -> lowest-recovery dorm position).
 * 5. Verify dynamic simulation: only accept swaps where newScore > currentScore.
 *    If score degrades or does not improve, rollback immediately to guarantee monotonicity!
 * 6. Repeat global detection loop iteratively until no further beneficial replacements exist.
 */
export function runGlobalPerCapitaReplacement(
  base: RosterWorkspace,
  inventory: OperatorInventory,
  options: ReplacementOptions = {},
): ReplacementResult {
  let ws = structuredClone(base)
  const maintainRunOrder = Object.values(base.mainPlan.facilities).some(r => r.type === 'trading' && r.slots.some(s => s.replacements.some(isShiftRunOperator)))
  const logs: string[] = []
  let swappedCount = 0

  const lockedPositions = options.lockedPositions ?? new Set<string>()
  const lockedOperators = options.lockedOperators ?? new Set<string>()

  const powerRooms = Object.values(ws.mainPlan.facilities).filter((r) => r.type === 'power')
  const powerCount = options.powerCount ?? powerRooms.length

  let currentScore = options.baselineScore ?? (options.evaluator ? options.evaluator(ws) : 0)

  const ownedNames = new Set(
    inventory.operators.filter((o) => o.matchesMaximumSkills).map((o) => o.name),
  )

  // ----------------------------------------------------
  // Step 1: Detect and Relocate Misplaced Pendants
  // ----------------------------------------------------
  if (powerCount <= 2) {
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

  // Detect and resolve Abyssal Hunter room concentration (> 2 hunters in a single manufacture room)
  const abyssalNames = ['斯卡蒂', '乌尔比安', '安哲拉', '幽灵鲨']
  for (const [rId, fac] of Object.entries(ws.mainPlan.facilities)) {
    if (fac.type !== 'manufacture') continue
    const hunterSlots: number[] = []
    for (let sIdx = 0; sIdx < fac.slots.length; sIdx++) {
      const slot = fac.slots[sIdx]!
      if (
        slot.occupant.kind === 'operator' &&
        abyssalNames.some((n) => resolveId((slot.occupant as { kind: 'operator'; operatorId: string }).operatorId) === resolveId(n)) &&
        !lockedPositions.has(`${rId}:${sIdx}`)
      ) {
        hunterSlots.push(sIdx)
      }
    }

    // If more than 2 hunters in this manufacture room, remove the 3rd+ hunter so the room does not hit the 90% cap and waste capacity
    while (hunterSlots.length > 2) {
      const sIdxToRemove = hunterSlots.pop()!
      const slot = fac.slots[sIdxToRemove]!
      const opId = slot.occupant.kind === 'operator' ? slot.occupant.operatorId : ''
      const removedName = abyssalNames.find((n) => resolveId(opId) === resolveId(n)) ?? '深海猎人'
      slot.occupant = { kind: 'empty' }
      slot.groupId = null
      slot.replacements = []
      logs.push(`[深海猎人防溢出] 检测到制造站 ${rId} 进驻超过2名深海猎人（受歌蕾蒂娅90%上限影响），已将第3人 ${removedName} 移出该站以释放高收益工位。`)
      swappedCount++
    }
  }

  function ensureValidBackups(targetWs: RosterWorkspace) {
    const currentlyReserved = new Set(
      Object.values(targetWs.mainPlan.facilities).flatMap((r) =>
        r.slots.flatMap((s) => [
          ...(s.occupant.kind === 'operator' ? [resolveId(s.occupant.operatorId)] : []),
          ...s.replacements.map(resolveId),
        ]),
      ),
    )

    for (const room of Object.values(targetWs.mainPlan.facilities)) {
      if (['manufacture', 'trading', 'power', 'central', 'meeting', 'factory', 'train'].includes(room.type)) {
        for (const slot of room.slots) {
          if (slot.occupant.kind === 'operator' && slot.replacements.length === 0) {
            const fallbackOp = inventory.operators.find(
              (o) =>
                (room.type !== 'trading' || !isUnsupportedTradeOperator(o.charId)) &&
                o.matchesMaximumSkills &&
                !currentlyReserved.has(o.charId) &&
                !lockedOperators.has(o.charId) &&
                !isShiftRunOperator(o.charId) &&
                !ALL_ATOMIC_CORE_NAMES.has(o.name) &&
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
  }

  // ----------------------------------------------------
  // Step 2: Global Per-Capita Detection & Swap Loop (Rule 6)
  // ----------------------------------------------------
  const MAX_ITERATIONS = 3
  const triedSwaps = new Set<string>()

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false

    const occupied = new Set<string>()
    for (const fac of Object.values(ws.mainPlan.facilities)) {
      for (const slot of fac.slots) {
        if (slot.occupant.kind === 'operator') {
          occupied.add(resolveId(slot.occupant.operatorId))
        }
      }
    }

    const productionRooms = Object.values(ws.mainPlan.facilities).filter(
      (r) => r.type === 'manufacture' || r.type === 'trading',
    )

    interface ProposedSwap {
      roomId: MowerRoomId
      slotIndices: number[]
      oldOps: { name: string; id: string; groupId: string | null }[]
      oldPerCapita: number
      candidate: AtomicUnit
      candidatePerCapita: number
      gain: number
    }

    const swapProposals: ProposedSwap[] = []

    for (const room of productionRooms) {
      const isManufacture = room.type === 'manufacture'
      const product = isManufacture ? room.product : 'money'
      const cap = room.slots.length

      const currentOps: { slotIdx: number; name: string; id: string; groupId: string | null }[] = []
      for (let idx = 0; idx < cap; idx++) {
        const slot = room.slots[idx]!
        if (slot.occupant.kind === 'operator') {
          const charId = resolveId(slot.occupant.operatorId)
          const opRecord = inventory.operators.find((o) => o.charId === charId)
          currentOps.push({ slotIdx: idx, name: opRecord?.name ?? charId, id: charId, groupId: slot.groupId })
        }
      }

      if (currentOps.length === 0) continue

      // Generate possible target subsets in this room (whole room or sub-groups)
      const possibleSubsets: { slotIndices: number[]; ops: typeof currentOps; activeUnit?: AtomicUnit; currentPerCapita: number }[] = []

      // Check whole room unit
      const wholeRoomUnit = ATOMIC_UNITS.find(
        (u) =>
          u.coreMembers.length === currentOps.length &&
          u.coreMembers.every((m) => currentOps.some((co) => co.name === m.name)),
      )
      if (wholeRoomUnit) {
        possibleSubsets.push({
          slotIndices: currentOps.map((co) => co.slotIdx),
          ops: currentOps,
          activeUnit: wholeRoomUnit,
          currentPerCapita: wholeRoomUnit.perCapitaOutput ?? 30,
        })
      } else {
        // Sub-group units (e.g. 2-person unit in a 3-person room)
        for (const u of ATOMIC_UNITS) {
          if (u.coreMembers.length < currentOps.length && u.coreMembers.length >= 2) {
            const matchingOps = currentOps.filter((co) => u.coreMembers.some((m) => m.name === co.name))
            if (matchingOps.length === u.coreMembers.length) {
              possibleSubsets.push({
                slotIndices: matchingOps.map((co) => co.slotIdx),
                ops: matchingOps,
                activeUnit: u,
                currentPerCapita: u.perCapitaOutput ?? 30,
              })
            }
          }
        }
        // Entire room as generic/singleton set
        possibleSubsets.push({
          slotIndices: currentOps.map((co) => co.slotIdx),
          ops: currentOps,
          currentPerCapita: 30,
        })

        // Also if room has 3 slots, check pairs of slots (0,1 and 1,2)
        if (cap === 3 && currentOps.length === 3) {
          possibleSubsets.push({
            slotIndices: [currentOps[0]!.slotIdx, currentOps[1]!.slotIdx],
            ops: [currentOps[0]!, currentOps[1]!],
            currentPerCapita: 30,
          })
          possibleSubsets.push({
            slotIndices: [currentOps[1]!.slotIdx, currentOps[2]!.slotIdx],
            ops: [currentOps[1]!, currentOps[2]!],
            currentPerCapita: 30,
          })
        }
      }

      for (const target of possibleSubsets) {
        const K = target.slotIndices.length
        if (K === 0) continue

        const hasLocked = target.slotIndices.some(
          (idx) =>
            lockedPositions.has(`${room.roomId}:${idx}`) ||
            (room.slots[idx]?.occupant.kind === 'operator' && lockedOperators.has(resolveId(room.slots[idx]!.occupant.operatorId))),
        )
        if (hasLocked) continue

        const currentTargetOpIds = new Set(target.ops.map((o) => o.id))

        // Match candidates of the EXACT SAME HEADCOUNT K
        const candidateUnits = ATOMIC_UNITS.filter((u) => {
          if (u.coreMembers.length !== K) return false // EXACT SAME headcount!
          if (u.preferredFacilityType !== room.type) return false
          if (isManufacture && u.preferredProduct !== 'any' && u.preferredProduct !== product) return false
          if (u.perCapitaOutput === undefined || u.perCapitaOutput <= target.currentPerCapita) return false
          if (powerCount <= 2 && isManufacture && u.coreMembers.some((m) => m.name === '至简')) return false

          for (const m of u.coreMembers) {
            if (!ownedNames.has(m.name)) return false
            const mId = resolveId(m.name)
            if (lockedOperators.has(mId)) return false
            if (occupied.has(mId) && !currentTargetOpIds.has(mId)) return false
          }
          return true
        })

        for (const cand of candidateUnits) {
          const swapKey = `${room.roomId}:${target.ops.map((o) => o.name).sort().join('+')}->${cand.id}`
          if (triedSwaps.has(swapKey)) continue

          swapProposals.push({
            roomId: room.roomId,
            slotIndices: target.slotIndices,
            oldOps: target.ops,
            oldPerCapita: target.currentPerCapita,
            candidate: cand,
            candidatePerCapita: cand.perCapitaOutput ?? 30,
            gain: (cand.perCapitaOutput ?? 30) - target.currentPerCapita,
          })
        }
      }
    }

    if (swapProposals.length === 0) break

    swapProposals.sort((a, b) => b.gain - a.gain)
    let evaluatedCount = 0

    for (const proposal of swapProposals) {
      if (options.evaluator && evaluatedCount >= 3) break
      const swapKey = `${proposal.roomId}:${proposal.oldOps.map((o) => o.name).sort().join('+')}->${proposal.candidate.id}`
      if (triedSwaps.has(swapKey)) continue

      const draftWs = structuredClone(ws)
      const targetRoom = draftWs.mainPlan.facilities[proposal.roomId]!

      // 1. Relocate any replaced operator that is a pendant
      for (const oldOp of proposal.oldOps) {
        if (isPendantOperator(oldOp.name, draftWs) || oldOp.groupId?.includes('挂件')) {
          const pendantResult = placePendantOperator(draftWs, oldOp.name, `${oldOp.name}_挂件`, inventory)
          if (pendantResult.placed) {
            logs.push(
              `[挂件转移] 设施 ${proposal.roomId}：${oldOp.name} 作为协同挂件，置换后已安置于非生产设施 ${pendantResult.roomId}。`,
            )
          }
        }
      }

      // 2. Clear old slots
      for (const sIdx of proposal.slotIndices) {
        targetRoom.slots[sIdx]!.occupant = { kind: 'empty' }
        targetRoom.slots[sIdx]!.groupId = null
        targetRoom.slots[sIdx]!.replacements = []
      }

      // 3. Place new candidate core members
      const newGroupId = `优化_${proposal.candidate.name}`
      proposal.candidate.coreMembers.forEach((m, idx) => {
        const slotIdx = proposal.slotIndices[idx]!
        const mId = resolveId(m.name)
        targetRoom.slots[slotIdx]!.occupant = { kind: 'operator', operatorId: mId }
        targetRoom.slots[slotIdx]!.groupId = newGroupId
      })

      // 4. Apply unit conf policy
      if (proposal.candidate.confPolicy) {
        if (proposal.candidate.confPolicy.exhaustRequire) {
          for (const n of proposal.candidate.confPolicy.exhaustRequire) {
            if (!draftWs.mainPlan.conf.exhaust_require.includes(n)) draftWs.mainPlan.conf.exhaust_require.push(n)
          }
        }
        if (proposal.candidate.confPolicy.restInFull) {
          for (const n of proposal.candidate.confPolicy.restInFull) {
            if (!draftWs.mainPlan.conf.rest_in_full.includes(n)) draftWs.mainPlan.conf.rest_in_full.push(n)
          }
        }
      }

      // 5. Ensure valid backups across draftWs
      ensureValidBackups(draftWs)
      if (maintainRunOrder && !configureRunOrder(draftWs, inventory)) continue

      // 6. Dynamic simulation check (Requirement 1 & Monotonicity)
      if (options.evaluator) {
        evaluatedCount++
        const simScore = options.evaluator(draftWs)
        if (simScore > currentScore) {
          logs.push(
            `[全局置换] 设施 ${proposal.roomId}：当前人均 ${proposal.oldPerCapita}% 成功替换为 ${proposal.candidate.name} (人均 ${proposal.candidatePerCapita}%)，动态拟真评分从 ${currentScore.toFixed(1)} 提升至 ${simScore.toFixed(1)} 分/日`,
          )
          ws = draftWs
          currentScore = simScore
          swappedCount++
          changed = true
          break
        } else {
          logs.push(
            `[置换放弃] 设施 ${proposal.roomId} 尝试置换为 ${proposal.candidate.name} 后动态拟真评分未提升 (${simScore.toFixed(1)} <= ${currentScore.toFixed(1)})，已回滚保持原状。`,
          )
          triedSwaps.add(swapKey)
        }
      } else {
        logs.push(
          `[全局置换] 设施 ${proposal.roomId}：当前人均产出 ${proposal.oldPerCapita}% 替换为 ${proposal.candidate.name} (人均产出 ${proposal.candidatePerCapita}%)`,
        )
        ws = draftWs
        swappedCount++
        changed = true
        break
      }
    }

    if (!changed) break
  }

  // Ensure all production slots are filled
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
          if (powerCount <= 2 && isManufacture && (name as string) === '至简') return false
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

  ensureValidBackups(ws)
  if (maintainRunOrder) configureRunOrder(ws, inventory)

  return { workspace: ws, swappedCount, score: currentScore, logs }
}
