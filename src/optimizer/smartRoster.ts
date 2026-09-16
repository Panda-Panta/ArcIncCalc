import type { MowerFacilityType, MowerRoomId, RosterWorkspace } from '../workbench/model'
import { resolveOperatorCharId as resolveId } from '../workbench/compat/mowerJson'
import { compileOperatorInventory, type OwnedOperatorInput } from '../domain/operatorInventory'
import { isShiftRunOperator } from '../scheduler/scheduleAdapter'
import { admitCombinationCandidates } from './inventoryAdmission'
import type { CandidateAvailability } from './combinationCandidates'
import { compileCandidateLayout, generateRosterDraft, assignBackups, validatePhysicalRoster } from './rosterDraft'
import { projectRosterOutput } from './rosterProjection'
import { runScheduleSimulationBridge } from '../workbench/scheduleSimulationBridge'
import { scoreProduction } from './productionObjective'
import { hasConsumptionSkill } from './fixedDuty'
import { runRosterIncomeSearch, type IncomeSearchResult } from './rosterIncomeSearch'
import { applySmartDormitoryPolicy } from '../scheduler/smartDormitoryPolicy'

export interface SmartRosterOptions {
  seed?: number
  trials?: number
  maxStaticEvals?: number
  simulationTopK?: number
  simulationWarmupHours?: number
  simulationSampleHours?: number
  enableDeepSearch?: boolean
  droneTarget?: 'gold' | 'exp' | 'trading' | 'none'
  overwriteExisting?: boolean
  enableSurrogate?: boolean
  surrogateSampleCount?: number
  surrogateTopK?: number
  surrogateCandidates?: SmartRosterCandidate[]
}

export interface SmartRosterProgress {
  phase: 'building' | 'simulating' | 'searching' | 'done'
  phaseProgress: number
  currentTrial?: number
  totalTrials?: number
  bestScore?: number
  label: string
}

export interface SpecialOperatorSimData {
  operatorId: string
  operatorName: string
  workFraction: number
  workRestRatio: number | null
  workHours: number
  restHours: number
  exhaustedHours: number
  finalMorale: number
}

export interface SmartRosterCandidate {
  id: string
  workspace: RosterWorkspace
  staticScore: number
  simScore: number | null
  diagnostics: string[]
  specialOperators?: SpecialOperatorSimData[]
}

export interface SmartRosterResult {
  status: 'draft' | 'blocked'
  workspace: RosterWorkspace | null
  score: number | null
  diagnostics: { code: string; message: string }[]
  specialOperators: SpecialOperatorSimData[]
  phases: {
    static: {
      candidates: SmartRosterCandidate[]
      bestScore: number | null
    }
    simulation: {
      candidates: SmartRosterCandidate[]
      bestScore: number | null
    } | null
    search: {
      improved: boolean
      gain: number
      result?: IncomeSearchResult
    } | null
  }
}

const facilityTypes = { manufacture: 'MANUFACTURE', trading: 'TRADING', power: 'POWER', central: 'CONTROL' } as const
const capacity = (type: MowerFacilityType, level: number) => {
  if (type === 'manufacture' || type === 'trading') return level
  if (type === 'central' || type === 'dormitory') return 5
  if (type === 'meeting' || type === 'train') return 2
  return ['power', 'contact', 'factory'].includes(type) ? 1 : 0
}

function randomGenerator(seed: number) {
  let n = seed >>> 0
  return () => {
    n = (n + 0x6d2b79f5) >>> 0
    let t = n
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const temp = result[i]!
    result[i] = result[j]!
    result[j] = temp
  }
  return result
}

function getOccupiedOperatorIds(w: RosterWorkspace): Set<string> {
  return new Set(
    Object.values(w.mainPlan.facilities).flatMap(r =>
      r.slots.flatMap(s => [
        ...(s.occupant.kind === 'operator' ? [resolveId(s.occupant.operatorId)] : []),
        ...s.replacements.map(resolveId),
      ])
    )
  )
}

function workspaceFingerprint(w: RosterWorkspace): string {
  const rooms = Object.values(w.mainPlan.facilities).map(r => [
    r.roomId,
    r.slots.map(s => (s.occupant.kind === 'operator' ? resolveId(s.occupant.operatorId) : '')),
    r.slots.map(s => s.replacements.map(resolveId)),
  ])
  return JSON.stringify(rooms)
}

/**
 * Normalizes all slot groups according to standard mower_plan.json conventions:
 * - Manufacture rooms: 全员统一 group 为 "组合_${roomId}"
 * - Trading rooms: 全员统一 group 为 "自动_${roomId}"
 * - Central: 歌蕾蒂娅（当制造站存在深海干员时）设为 "深海队"，其余全部统一为 "自动_central"
 * - All other rooms (power, dormitory, meeting, contact/office, factory, train): group 强制为 null ("")
 */
export function normalizeWorkspaceGroups(
  ws: RosterWorkspace,
  lockedPositions?: Set<string>,
): void {
  const abyssalCharIds = new Set([
    resolveId('斯卡蒂'),
    resolveId('乌尔比安'),
    resolveId('幽灵鲨'),
    resolveId('安哲拉'),
  ])
  let hasAbyssalInManufacture = false
  for (const room of Object.values(ws.mainPlan.facilities)) {
    if (room.type === 'manufacture') {
      for (const slot of room.slots) {
        if (slot.occupant.kind === 'operator' && abyssalCharIds.has(resolveId(slot.occupant.operatorId))) {
          hasAbyssalInManufacture = true
          break
        }
      }
    }
    if (hasAbyssalInManufacture) break
  }

  const gladiiaCharId = resolveId('歌蕾蒂娅')

  for (const room of Object.values(ws.mainPlan.facilities)) {
    for (let slotIdx = 0; slotIdx < room.slots.length; slotIdx++) {
      const slot = room.slots[slotIdx]!
      const posKey = `${room.roomId}:${slotIdx}`
      if (lockedPositions && lockedPositions.has(posKey)) {
        continue
      }

      if (room.type === 'manufacture') {
        if (slot.occupant.kind === 'operator') {
          slot.groupId = `组合_${room.roomId}`
        } else {
          slot.groupId = null
        }
      } else if (room.type === 'trading') {
        if (slot.occupant.kind === 'operator') {
          slot.groupId = `自动_${room.roomId}`
        } else {
          slot.groupId = null
        }
      } else if (room.type === 'central') {
        if (slot.occupant.kind === 'operator') {
          const charId = resolveId(slot.occupant.operatorId)
          if (charId === gladiiaCharId && hasAbyssalInManufacture) {
            slot.groupId = '深海队'
          } else {
            slot.groupId = '自动_central'
          }
        } else {
          slot.groupId = null
        }
      } else {
        slot.groupId = null
      }
    }
  }
}

/**
 * Filter out mined combinations that contain conflicting cross-archetype mixtures
 * (e.g. Abyssal Hunters mixed with Pinus Sylvestris, Mizuki mixed into Bubble group, etc.)
 */
function isDirtyMowerCombination(candidate: CandidateAvailability): boolean {
  const opNames: string[] = [
    ...candidate.targetAssignment.operators.map((o) => o.name),
    ...candidate.supportAssignments.flatMap((a) => a.operators.map((o) => o.name)),
  ]
  if (opNames.includes('水月') && (opNames.includes('泡泡') || opNames.includes('火神'))) {
    return true
  }

  if (candidate.optimizerTags?.includes('mower-observed')) {
    const hasAbyssal = opNames.some((n: string) => ['乌尔比安', '斯卡蒂', '幽灵鲨', '安哲拉'].includes(n))
    const hasPinus = opNames.some((n: string) => ['野鬃', '灰毫', '远牙'].includes(n))
    const hasRosemary = opNames.includes('迷迭香')
    const hasBubble = opNames.some((n: string) => ['泡泡', '火神'].includes(n))
    const hasAroma = opNames.includes('阿罗玛')

    let distinctArchetypes = 0
    if (hasAbyssal) distinctArchetypes++
    if (hasPinus) distinctArchetypes++
    if (hasRosemary) distinctArchetypes++
    if (hasBubble) distinctArchetypes++
    if (hasAroma && hasAbyssal) return true

    if (distinctArchetypes >= 2) return true
  }

  return false
}

interface SynergyArchetype {
  id: string
  name: string
  priority: number
  tryDeploy: (
    ws: RosterWorkspace,
    ownedCharIds: Set<string>,
    lockedPositions: Set<string>,
    lockedOperators: Set<string>,
  ) => boolean
}

const SYNERGY_ARCHETYPES: SynergyArchetype[] = [
  {
    id: 'abyssal_team',
    name: '深海猎人全套(2+2制造+中枢+贸易)',
    priority: 100,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const gladiia = resolveId('歌蕾蒂娅')
      if (!owned.has(gladiia) || lockedOps.has(gladiia)) return false

      const central = ws.mainPlan.facilities.central
      if (!central) return false
      const centralEmptySlot = central.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`central:${idx}`))
      if (!centralEmptySlot) return false

      const hunterPool = ['乌尔比安', '斯卡蒂', '幽灵鲨', '安哲拉']
        .map(resolveId)
        .filter(id => owned.has(id) && !lockedOps.has(id) && !getOccupiedOperatorIds(ws).has(id))
      if (hunterPool.length < 2) return false

      const mRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' && capacity(r.type, r.level) >= 2,
      )
      mRooms.sort((a, b) => (b.product === 'exp' ? 1 : 0) - (a.product === 'exp' ? 1 : 0))

      // 规则：歌蕾蒂娅同一个站内深海猎人最多提供80%，必须2+2分配在两间制造站（绝不3+1）
      if (hunterPool.length === 4) {
        let roomA: typeof mRooms[0] | null = null
        let roomB: typeof mRooms[0] | null = null
        for (let i = 0; i < mRooms.length; i++) {
          const r1 = mRooms[i]!
          const empty1 = r1.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${r1.roomId}:${idx}`))
          if (empty1.length < 2) continue
          for (let j = i + 1; j < mRooms.length; j++) {
            const r2 = mRooms[j]!
            const empty2 = r2.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${r2.roomId}:${idx}`))
            if (empty2.length >= 2) {
              roomA = r1
              roomB = r2
              break
            }
          }
          if (roomA && roomB) break
        }

        if (roomA && roomB) {
          const emptyA = roomA.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${roomA.roomId}:${idx}`))
          const emptyB = roomB.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${roomB.roomId}:${idx}`))

          centralEmptySlot.occupant = { kind: 'operator', operatorId: gladiia }
          centralEmptySlot.groupId = '深海队'

          emptyA[0]!.occupant = { kind: 'operator', operatorId: hunterPool[0]! }
          emptyA[0]!.groupId = `组合_${roomA.roomId}`
          emptyA[1]!.occupant = { kind: 'operator', operatorId: hunterPool[1]! }
          emptyA[1]!.groupId = `组合_${roomA.roomId}`

          emptyB[0]!.occupant = { kind: 'operator', operatorId: hunterPool[2]! }
          emptyB[0]!.groupId = `组合_${roomB.roomId}`
          emptyB[1]!.occupant = { kind: 'operator', operatorId: hunterPool[3]! }
          emptyB[1]!.groupId = `组合_${roomB.roomId}`

          const deepflow = resolveId('深巡')
          if (owned.has(deepflow) && !lockedOps.has(deepflow) && !getOccupiedOperatorIds(ws).has(deepflow)) {
            const tRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'trading')
            for (const tr of tRooms) {
              const tSlot = tr.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${tr.roomId}:${idx}`))
              if (tSlot) {
                tSlot.occupant = { kind: 'operator', operatorId: deepflow }
                tSlot.groupId = `自动_${tr.roomId}`
                break
              }
            }
          }
          return true
        }
      }

      // 若猎人人数不足4人或仅有1间2槽制造站：入驻2人
      for (const room of mRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          centralEmptySlot.occupant = { kind: 'operator', operatorId: gladiia }
          centralEmptySlot.groupId = '深海队'

          emptySlots[0]!.occupant = { kind: 'operator', operatorId: hunterPool[0]! }
          emptySlots[0]!.groupId = `组合_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: hunterPool[1]! }
          emptySlots[1]!.groupId = `组合_${room.roomId}`

          const deepflow = resolveId('深巡')
          if (hunterPool.includes(resolveId('乌尔比安')) && owned.has(deepflow) && !lockedOps.has(deepflow) && !getOccupiedOperatorIds(ws).has(deepflow)) {
            const tRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'trading')
            for (const tr of tRooms) {
              const tSlot = tr.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${tr.roomId}:${idx}`))
              if (tSlot) {
                tSlot.occupant = { kind: 'operator', operatorId: deepflow }
                tSlot.groupId = `自动_${tr.roomId}`
                break
              }
            }
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'automation_team',
    name: '温蒂清流森蚺自动化',
    priority: 95,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const weedy = resolveId('温蒂')
      const purestream = resolveId('清流')
      const eunectes = resolveId('森蚺')
      if (!owned.has(weedy) || !owned.has(purestream) || !owned.has(eunectes)) return false
      if (lockedOps.has(weedy) || lockedOps.has(purestream) || lockedOps.has(eunectes)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(weedy) || occupied.has(purestream) || occupied.has(eunectes)) return false

      const central = ws.mainPlan.facilities.central
      if (!central) return false
      const centralEmptySlot = central.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`central:${idx}`))
      if (!centralEmptySlot) return false

      const mRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' && r.product === 'gold' && capacity(r.type, r.level) >= 2,
      )
      for (const room of mRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          centralEmptySlot.occupant = { kind: 'operator', operatorId: eunectes }
          centralEmptySlot.groupId = '自动_central'

          emptySlots[0]!.occupant = { kind: 'operator', operatorId: weedy }
          emptySlots[0]!.groupId = `组合_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: purestream }
          emptySlots[1]!.groupId = `组合_${room.roomId}`

          if (emptySlots.length >= 3) {
            const autoThirdOps = ['冬时', '异客', '掠风']
              .map(resolveId)
              .filter(id => owned.has(id) && !lockedOps.has(id) && !getOccupiedOperatorIds(ws).has(id))
            if (autoThirdOps.length > 0) {
              emptySlots[2]!.occupant = { kind: 'operator', operatorId: autoThirdOps[0]! }
              emptySlots[2]!.groupId = `组合_${room.roomId}`
            }
          }

          const powerOps = ['承曦格雷伊', 'Lancet-2'].map(resolveId).filter(id => owned.has(id) && !lockedOps.has(id) && !getOccupiedOperatorIds(ws).has(id))
          if (powerOps.length > 0) {
            const powerRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'power')
            for (const pr of powerRooms) {
              const pSlot = pr.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${pr.roomId}:${idx}`))
              if (pSlot && powerOps.length > 0) {
                pSlot.occupant = { kind: 'operator', operatorId: powerOps.shift()! }
                pSlot.groupId = null
              }
            }
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'blacksteel_team',
    name: '黑钢国际体系',
    priority: 94,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const jessica2 = resolveId('涤火杰西卡')
      const mizuki = resolveId('水月')
      const vanilla = resolveId('香草')
      const jessica = resolveId('杰西卡')
      const mMembers = [mizuki, vanilla, jessica]

      if (!owned.has(jessica2) || lockedOps.has(jessica2)) return false
      if (!mMembers.every(id => owned.has(id) && !lockedOps.has(id))) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(jessica2) || mMembers.some(id => occupied.has(id))) return false

      const central = ws.mainPlan.facilities.central
      if (!central) return false
      const centralSlot = central.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`central:${idx}`))
      if (!centralSlot) return false

      const mRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' && capacity(r.type, r.level) >= 3,
      )
      for (const room of mRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 3) {
          centralSlot.occupant = { kind: 'operator', operatorId: jessica2 }
          centralSlot.groupId = '自动_central'

          for (let i = 0; i < 3; i++) {
            emptySlots[i]!.occupant = { kind: 'operator', operatorId: mMembers[i]! }
            emptySlots[i]!.groupId = `组合_${room.roomId}`
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'laterano_trade',
    name: '拉特兰贸易组',
    priority: 92,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const lemuen = resolveId('蕾缪安')
      const exusiai = resolveId('能天使')
      if (!owned.has(lemuen) || !owned.has(exusiai) || lockedOps.has(lemuen) || lockedOps.has(exusiai)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(lemuen) || occupied.has(exusiai)) return false

      const archetto = resolveId('空弦')
      const hasArchetto = owned.has(archetto) && !lockedOps.has(archetto) && !occupied.has(archetto)

      const tRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'trading' && capacity(r.type, r.level) >= 2,
      )
      tRooms.sort((a, b) => (hasArchetto ? capacity(b.type, b.level) - capacity(a.type, a.level) : 0))

      for (const room of tRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          emptySlots[0]!.occupant = { kind: 'operator', operatorId: lemuen }
          emptySlots[0]!.groupId = `自动_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: exusiai }
          emptySlots[1]!.groupId = `自动_${room.roomId}`
          if (emptySlots.length >= 3 && hasArchetto) {
            emptySlots[2]!.occupant = { kind: 'operator', operatorId: archetto }
            emptySlots[2]!.groupId = `自动_${room.roomId}`
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'pozyomka_durin_trade',
    name: '鸿雪四杜林贸易',
    priority: 91,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const bgsnow = resolveId('鸿雪')
      const tuye = resolveId('图耶')
      const kirara = resolveId('绮良')
      const tradeMembers = [bgsnow, tuye, kirara]
      if (!tradeMembers.every(id => owned.has(id) && !lockedOps.has(id))) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (tradeMembers.some(id => occupied.has(id))) return false

      const durinPool = ['特克诺', '至简', '褐果', '杜林', '桃金娘']
        .map(resolveId)
        .filter(id => owned.has(id) && !lockedOps.has(id) && !occupied.has(id))
      if (durinPool.length < 4) return false

      const tRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'trading' && capacity(r.type, r.level) >= 3,
      )
      let tRoom: typeof tRooms[0] | null = null
      for (const tr of tRooms) {
        const empty = tr.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${tr.roomId}:${idx}`))
        if (empty.length >= 3) {
          tRoom = tr
          break
        }
      }
      if (!tRoom) return false

      const assignedDurins: { slot: any; opId: string }[] = []
      const durinQueue = [...durinPool]

      const technoId = resolveId('特克诺')
      const factory = ws.mainPlan.facilities.factory
      if (factory && durinQueue.includes(technoId)) {
        const s = factory.slots.find((slot, idx) => slot.occupant.kind === 'empty' && !lockedPos.has(`factory:${idx}`))
        if (s) {
          assignedDurins.push({ slot: s, opId: technoId })
          durinQueue.splice(durinQueue.indexOf(technoId), 1)
        }
      }

      const minimalId = resolveId('至简')
      const train = ws.mainPlan.facilities.train
      if (train && durinQueue.includes(minimalId)) {
        const s = train.slots.find((slot, idx) => slot.occupant.kind === 'empty' && !lockedPos.has(`train:${idx}`))
        if (s) {
          assignedDurins.push({ slot: s, opId: minimalId })
          durinQueue.splice(durinQueue.indexOf(minimalId), 1)
        }
      }

      const chnutId = resolveId('褐果')
      if (train && durinQueue.includes(chnutId)) {
        const s = train.slots.find((slot, idx) => slot.occupant.kind === 'empty' && !lockedPos.has(`train:${idx}`))
        if (s) {
          assignedDurins.push({ slot: s, opId: chnutId })
          durinQueue.splice(durinQueue.indexOf(chnutId), 1)
        }
      }

      const dorms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'dormitory')
      for (const d of dorms) {
        if (assignedDurins.length >= 4) break
        for (let i = 0; i < d.slots.length; i++) {
          if (assignedDurins.length >= 4 || durinQueue.length === 0) break
          const s = d.slots[i]!
          if (s.occupant.kind === 'empty' && !lockedPos.has(`${d.roomId}:${i}`)) {
            assignedDurins.push({ slot: s, opId: durinQueue.shift()! })
          }
        }
      }

      if (assignedDurins.length < 4) return false

      const emptySlots = tRoom.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${tRoom.roomId}:${idx}`))
      for (let i = 0; i < 3; i++) {
        emptySlots[i]!.occupant = { kind: 'operator', operatorId: tradeMembers[i]! }
        emptySlots[i]!.groupId = `自动_${tRoom.roomId}`
      }

      for (const a of assignedDurins) {
        a.slot.occupant = { kind: 'operator', operatorId: a.opId }
        a.slot.groupId = null
      }

      return true
    },
  },
  {
    id: 'pinus_team',
    name: '红松骑士团全套',
    priority: 90,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const viviana = resolveId('薇薇安娜')
      const flametail = resolveId('焰尾')
      const wildmane = resolveId('野鬃')
      const ashlock = resolveId('灰毫')
      const fartooth = resolveId('远牙')
      const members = [viviana, flametail, wildmane, ashlock, fartooth]
      if (!members.every(id => owned.has(id) && !lockedOps.has(id))) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (members.some(id => occupied.has(id))) return false

      const central = ws.mainPlan.facilities.central
      if (!central) return false
      const centralEmptySlots = central.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`central:${idx}`))
      if (centralEmptySlots.length < 2) return false

      const mRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' && r.product === 'exp' && capacity(r.type, r.level) >= 3,
      )
      for (const room of mRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 3) {
          centralEmptySlots[0]!.occupant = { kind: 'operator', operatorId: viviana }
          centralEmptySlots[0]!.groupId = '自动_central'
          centralEmptySlots[1]!.occupant = { kind: 'operator', operatorId: flametail }
          centralEmptySlots[1]!.groupId = '自动_central'

          emptySlots[0]!.occupant = { kind: 'operator', operatorId: wildmane }
          emptySlots[0]!.groupId = `组合_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: ashlock }
          emptySlots[1]!.groupId = `组合_${room.roomId}`
          emptySlots[2]!.occupant = { kind: 'operator', operatorId: fartooth }
          emptySlots[2]!.groupId = `组合_${room.roomId}`
          return true
        }
      }
      return false
    },
  },
  {
    id: 'red_cloud_team',
    name: '红云容量组',
    priority: 89,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const redcloud = resolveId('红云')
      const scene = resolveId('稀音')
      if (!owned.has(redcloud) || !owned.has(scene) || lockedOps.has(redcloud) || lockedOps.has(scene)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(redcloud) || occupied.has(scene)) return false

      const partnerPool = ['刻俄柏', '帕拉斯', '酒神', 'Miss.Christine', '铸铁']
        .map(resolveId)
        .filter(id => owned.has(id) && !lockedOps.has(id) && !occupied.has(id))
      if (partnerPool.length === 0) return false

      const mRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' && capacity(r.type, r.level) >= 3,
      )
      mRooms.sort((a, b) => (b.product === 'exp' ? 1 : 0) - (a.product === 'exp' ? 1 : 0))

      for (const room of mRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 3) {
          emptySlots[0]!.occupant = { kind: 'operator', operatorId: redcloud }
          emptySlots[0]!.groupId = `组合_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: scene }
          emptySlots[1]!.groupId = `组合_${room.roomId}`
          emptySlots[2]!.occupant = { kind: 'operator', operatorId: partnerPool[0]! }
          emptySlots[2]!.groupId = `组合_${room.roomId}`
          return true
        }
      }
      return false
    },
  },
  {
    id: 'sees_team',
    name: 'S.E.E.S.全套协同',
    priority: 88,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const makoto = resolveId('结城理')
      const aigis = resolveId('埃癸斯')
      const yukari = resolveId('岳羽由加莉')
      const koromaru = resolveId('虎狼丸')
      const allSees = [makoto, aigis, yukari, koromaru]
      if (!allSees.every(id => owned.has(id) && !lockedOps.has(id))) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (allSees.some(id => occupied.has(id))) return false

      const mRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'manufacture')
      let mSlot: typeof mRooms[0]['slots'][0] | null = null
      let mRoomId: string | null = null
      for (const r of mRooms) {
        const s = r.slots.find((slot, idx) => slot.occupant.kind === 'empty' && !lockedPos.has(`${r.roomId}:${idx}`))
        if (s) {
          mSlot = s
          mRoomId = r.roomId
          break
        }
      }
      if (!mSlot || !mRoomId) return false

      const pRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'power')
      let pSlot: typeof pRooms[0]['slots'][0] | null = null
      for (const r of pRooms) {
        const s = r.slots.find((slot, idx) => slot.occupant.kind === 'empty' && !lockedPos.has(`${r.roomId}:${idx}`))
        if (s) {
          pSlot = s
          break
        }
      }
      if (!pSlot) return false

      let ySlot: any = null
      const train = ws.mainPlan.facilities.train
      if (train) {
        ySlot = train.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`train:${idx}`))
      }
      if (!ySlot) {
        const contact = ws.mainPlan.facilities.contact
        if (contact) {
          ySlot = contact.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`contact:${idx}`))
        }
      }
      if (!ySlot) return false

      let kSlot: any = null
      const meeting = ws.mainPlan.facilities.meeting
      if (meeting) {
        kSlot = meeting.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`meeting:${idx}`))
      }
      if (!kSlot) {
        const dorms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'dormitory')
        for (const d of dorms) {
          const s = d.slots.find((slot, idx) => slot.occupant.kind === 'empty' && !lockedPos.has(`${d.roomId}:${idx}`))
          if (s) {
            kSlot = s
            break
          }
        }
      }
      if (!kSlot) return false

      mSlot.occupant = { kind: 'operator', operatorId: makoto }
      mSlot.groupId = `组合_${mRoomId}`

      pSlot.occupant = { kind: 'operator', operatorId: aigis }
      pSlot.groupId = null

      ySlot.occupant = { kind: 'operator', operatorId: yukari }
      ySlot.groupId = null

      kSlot.occupant = { kind: 'operator', operatorId: koromaru }
      kSlot.groupId = null

      return true
    },
  },
  {
    id: 'siracusa_trade',
    name: '叙拉古贸易组',
    priority: 87,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const bellone = resolveId('贝洛内')
      const vigil = resolveId('伺夜')
      if (!owned.has(bellone) || !owned.has(vigil) || lockedOps.has(bellone) || lockedOps.has(vigil)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(bellone) || occupied.has(vigil)) return false

      const umika = resolveId('八幡海铃')
      const hasUmika = owned.has(umika) && !lockedOps.has(umika) && !occupied.has(umika)

      const tRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'trading' && capacity(r.type, r.level) >= 2,
      )
      tRooms.sort((a, b) => capacity(b.type, b.level) - capacity(a.type, a.level))

      for (const room of tRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          emptySlots[0]!.occupant = { kind: 'operator', operatorId: bellone }
          emptySlots[0]!.groupId = `自动_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: vigil }
          emptySlots[1]!.groupId = `自动_${room.roomId}`

          if (hasUmika) {
            if (emptySlots.length >= 3) {
              emptySlots[2]!.occupant = { kind: 'operator', operatorId: umika }
              emptySlots[2]!.groupId = `自动_${room.roomId}`
            } else {
              const central = ws.mainPlan.facilities.central
              if (central) {
                const cSlot = central.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`central:${idx}`))
                if (cSlot) {
                  cSlot.occupant = { kind: 'operator', operatorId: umika }
                  cSlot.groupId = '自动_central'
                }
              }
            }
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'bubble_team',
    name: '泡泡容量组',
    priority: 86,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const bubble = resolveId('泡泡')
      const vulcan = resolveId('火神')
      if (!owned.has(bubble) || !owned.has(vulcan) || lockedOps.has(bubble) || lockedOps.has(vulcan)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(bubble) || occupied.has(vulcan)) return false

      const partnerPool = ['贝娜', '圣约送葬人', '刻俄柏']
        .map(resolveId)
        .filter(id => owned.has(id) && !lockedOps.has(id) && !occupied.has(id))

      const mRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' && capacity(r.type, r.level) >= 2,
      )
      mRooms.sort((a, b) => (b.product === 'exp' ? 1 : 0) - (a.product === 'exp' ? 1 : 0))

      for (const room of mRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          emptySlots[0]!.occupant = { kind: 'operator', operatorId: bubble }
          emptySlots[0]!.groupId = `组合_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: vulcan }
          emptySlots[1]!.groupId = `组合_${room.roomId}`
          if (emptySlots.length >= 3 && partnerPool.length > 0) {
            emptySlots[2]!.occupant = { kind: 'operator', operatorId: partnerPool[0]! }
            emptySlots[2]!.groupId = `组合_${room.roomId}`
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'perception_team',
    name: '感知信息联动',
    priority: 85,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const rosemary = resolveId('迷迭香')
      const ebenholz = resolveId('黑键')
      const whispers = resolveId('絮雨')
      if (!owned.has(rosemary) || !owned.has(ebenholz) || !owned.has(whispers)) return false
      if (lockedOps.has(rosemary) || lockedOps.has(ebenholz) || lockedOps.has(whispers)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(rosemary) || occupied.has(ebenholz) || occupied.has(whispers)) return false

      const contact = ws.mainPlan.facilities.contact
      if (!contact) return false
      const contactSlot = contact.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`contact:${idx}`))
      if (!contactSlot) return false

      const tRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'trading')
      let tradeSlot: typeof tRooms[0]['slots'][0] | null = null
      let tradeRoomId: string | null = null
      for (const tr of tRooms) {
        const s = tr.slots.find((slot, idx) => slot.occupant.kind === 'empty' && !lockedPos.has(`${tr.roomId}:${idx}`))
        if (s) {
          tradeSlot = s
          tradeRoomId = tr.roomId
          break
        }
      }
      if (!tradeSlot || !tradeRoomId) return false

      const mRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'manufacture')
      let manuSlot: typeof mRooms[0]['slots'][0] | null = null
      let manuRoomId: string | null = null
      for (const mr of mRooms) {
        const s = mr.slots.find((slot, idx) => slot.occupant.kind === 'empty' && !lockedPos.has(`${mr.roomId}:${idx}`))
        if (s) {
          manuSlot = s
          manuRoomId = mr.roomId
          break
        }
      }
      if (!manuSlot || !manuRoomId) return false

      contactSlot.occupant = { kind: 'operator', operatorId: whispers }
      contactSlot.groupId = null

      tradeSlot.occupant = { kind: 'operator', operatorId: ebenholz }
      tradeSlot.groupId = `自动_${tradeRoomId}`

      manuSlot.occupant = { kind: 'operator', operatorId: rosemary }
      manuSlot.groupId = `组合_${manuRoomId}`

      const suiIds = ['令', '夕', '琴柳'].map(resolveId).filter(id => owned.has(id) && !lockedOps.has(id) && !getOccupiedOperatorIds(ws).has(id))
      const central = ws.mainPlan.facilities.central
      if (central) {
        for (const suiId of suiIds) {
          const cSlot = central.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`central:${idx}`))
          if (cSlot) {
            cSlot.occupant = { kind: 'operator', operatorId: suiId }
            cSlot.groupId = '自动_central'
          }
        }
      }
      return true
    },
  },
  {
    id: 'fireworks_trade',
    name: '人间烟火贸易组',
    priority: 84,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const nothin = resolveId('乌有')
      if (!owned.has(nothin) || lockedOps.has(nothin)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(nothin)) return false

      const tRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'trading')
      let tradeSlot: typeof tRooms[0]['slots'][0] | null = null
      let tradeRoomId: string | null = null
      for (const tr of tRooms) {
        const s = tr.slots.find((slot, idx) => slot.occupant.kind === 'empty' && !lockedPos.has(`${tr.roomId}:${idx}`))
        if (s) {
          tradeSlot = s
          tradeRoomId = tr.roomId
          break
        }
      }
      if (!tradeSlot || !tradeRoomId) return false

      tradeSlot.occupant = { kind: 'operator', operatorId: nothin }
      tradeSlot.groupId = `自动_${tradeRoomId}`

      const mberry = resolveId('桑葚')
      const contact = ws.mainPlan.facilities.contact
      if (contact && owned.has(mberry) && !lockedOps.has(mberry) && !occupied.has(mberry)) {
        const cSlot = contact.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`contact:${idx}`))
        if (cSlot) {
          cSlot.occupant = { kind: 'operator', operatorId: mberry }
          cSlot.groupId = null
        }
      }

      const suiOps = ['夕', '令'].map(resolveId).filter(id => owned.has(id) && !lockedOps.has(id) && !getOccupiedOperatorIds(ws).has(id))
      const central = ws.mainPlan.facilities.central
      if (central) {
        for (const suiId of suiOps) {
          const cSlot = central.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`central:${idx}`))
          if (cSlot) {
            cSlot.occupant = { kind: 'operator', operatorId: suiId }
            cSlot.groupId = '自动_central'
          }
        }
      }
      return true
    },
  },
  {
    id: 'rhine_lab_team',
    name: '莱茵生命体系',
    priority: 83,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const dorothy = resolveId('多萝西')
      const silence = resolveId('淬羽赫默')
      if (!owned.has(dorothy) || !owned.has(silence) || lockedOps.has(dorothy) || lockedOps.has(silence)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(dorothy) || occupied.has(silence)) return false

      const nasti = resolveId('娜斯提')
      const hasNasti = owned.has(nasti) && !lockedOps.has(nasti) && !occupied.has(nasti)

      const mRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' && capacity(r.type, r.level) >= 2,
      )
      mRooms.sort((a, b) => {
        if (hasNasti) {
          return (b.product === 'gold' ? 1 : 0) - (a.product === 'gold' ? 1 : 0)
        }
        return 0
      })

      for (const room of mRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          emptySlots[0]!.occupant = { kind: 'operator', operatorId: dorothy }
          emptySlots[0]!.groupId = `组合_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: silence }
          emptySlots[1]!.groupId = `组合_${room.roomId}`

          if (emptySlots.length >= 3) {
            const thirdPool = [hasNasti ? nasti : null, resolveId('白面鸮'), resolveId('星源'), resolveId('梅尔')]
              .filter(Boolean) as string[]
            const thirdOp = thirdPool.find(id => owned.has(id) && !lockedOps.has(id) && !getOccupiedOperatorIds(ws).has(id))
            if (thirdOp) {
              emptySlots[2]!.occupant = { kind: 'operator', operatorId: thirdOp }
              emptySlots[2]!.groupId = `组合_${room.roomId}`
            }
          }

          const muelsyse = resolveId('缪尔赛思')
          if (owned.has(muelsyse) && !lockedOps.has(muelsyse) && !getOccupiedOperatorIds(ws).has(muelsyse)) {
            const pRooms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'power')
            for (const pr of pRooms) {
              const pSlot = pr.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${pr.roomId}:${idx}`))
              if (pSlot) {
                pSlot.occupant = { kind: 'operator', operatorId: muelsyse }
                pSlot.groupId = null
                break
              }
            }
          }

          const extRhine = ['白面鸮', '塞雷娅', '星源', '麦哲伦'].map(resolveId)
            .filter(id => owned.has(id) && !lockedOps.has(id) && !getOccupiedOperatorIds(ws).has(id))
          const dorms = Object.values(ws.mainPlan.facilities).filter(r => r.type === 'dormitory')
          for (const d of dorms) {
            if (extRhine.length === 0) break
            for (let i = 0; i < d.slots.length; i++) {
              if (extRhine.length === 0) break
              const s = d.slots[i]!
              if (s.occupant.kind === 'empty' && !lockedPos.has(`${d.roomId}:${i}`)) {
                s.occupant = { kind: 'operator', operatorId: extRhine.shift()! }
                s.groupId = null
              }
            }
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'cantabile_team',
    name: '苍苔砾引星棘刺赤金',
    priority: 82,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const cantabile = resolveId('苍苔')
      const gravel = resolveId('砾')
      if (!owned.has(cantabile) || !owned.has(gravel) || lockedOps.has(cantabile) || lockedOps.has(gravel)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(cantabile) || occupied.has(gravel)) return false

      const partnerPool = ['引星棘刺', '斑点', '夜烟', '温米'].map(resolveId)
        .filter(id => owned.has(id) && !lockedOps.has(id) && !occupied.has(id))

      const mRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' && r.product === 'gold' && capacity(r.type, r.level) >= 2,
      )
      for (const room of mRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          emptySlots[0]!.occupant = { kind: 'operator', operatorId: cantabile }
          emptySlots[0]!.groupId = `组合_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: gravel }
          emptySlots[1]!.groupId = `组合_${room.roomId}`
          if (emptySlots.length >= 3 && partnerPool.length > 0) {
            emptySlots[2]!.occupant = { kind: 'operator', operatorId: partnerPool[0]! }
            emptySlots[2]!.groupId = `组合_${room.roomId}`
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'glasgow_trade',
    name: '格拉斯哥贸易组',
    priority: 81,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const delphine = resolveId('戴菲恩')
      const siege = resolveId('推进之王')
      const morgan = resolveId('摩根')
      if (!owned.has(delphine) || !owned.has(siege) || !owned.has(morgan)) return false
      if (lockedOps.has(delphine) || lockedOps.has(siege) || lockedOps.has(morgan)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(delphine) || occupied.has(siege) || occupied.has(morgan)) return false

      const central = ws.mainPlan.facilities.central
      if (!central) return false
      const centralEmptySlot = central.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`central:${idx}`))
      if (!centralEmptySlot) return false

      const tRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'trading' && capacity(r.type, r.level) >= 2,
      )
      for (const room of tRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          centralEmptySlot.occupant = { kind: 'operator', operatorId: delphine }
          centralEmptySlot.groupId = '自动_central'

          emptySlots[0]!.occupant = { kind: 'operator', operatorId: siege }
          emptySlots[0]!.groupId = `自动_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: morgan }
          emptySlots[1]!.groupId = `自动_${room.roomId}`
          return true
        }
      }
      return false
    },
  },
  {
    id: 'karlan_trade',
    name: '喀兰贸易组',
    priority: 80,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const gnosis = resolveId('灵知')
      const silverash = resolveId('银灰')
      const jaye = resolveId('孑')
      if (!owned.has(gnosis) || !owned.has(silverash) || !owned.has(jaye)) return false
      if (lockedOps.has(gnosis) || lockedOps.has(silverash) || lockedOps.has(jaye)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(gnosis) || occupied.has(silverash) || occupied.has(jaye)) return false

      const partnerPool = ['崖心', '锏', '琳琅诗怀雅'].map(resolveId)
        .filter(id => owned.has(id) && !lockedOps.has(id) && !occupied.has(id))

      const central = ws.mainPlan.facilities.central
      if (!central) return false
      const centralEmptySlot = central.slots.find((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`central:${idx}`))
      if (!centralEmptySlot) return false

      const tRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'trading' && capacity(r.type, r.level) >= 2,
      )
      for (const room of tRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          centralEmptySlot.occupant = { kind: 'operator', operatorId: gnosis }
          centralEmptySlot.groupId = '自动_central'

          emptySlots[0]!.occupant = { kind: 'operator', operatorId: silverash }
          emptySlots[0]!.groupId = `自动_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: jaye }
          emptySlots[1]!.groupId = `自动_${room.roomId}`
          if (emptySlots.length >= 3 && partnerPool.length > 0) {
            emptySlots[2]!.occupant = { kind: 'operator', operatorId: partnerPool[0]! }
            emptySlots[2]!.groupId = `自动_${room.roomId}`
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'monster_hunter_trade',
    name: '怪猎二期贸易组',
    priority: 79,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const orchid2 = resolveId('焰狐龙梓兰')
      const catap2 = resolveId('雷狼龙S空爆')
      if (!owned.has(orchid2) || !owned.has(catap2) || lockedOps.has(orchid2) || lockedOps.has(catap2)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(orchid2) || occupied.has(catap2)) return false

      const tRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'trading' && capacity(r.type, r.level) >= 2,
      )
      for (const room of tRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          emptySlots[0]!.occupant = { kind: 'operator', operatorId: orchid2 }
          emptySlots[0]!.groupId = `自动_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: catap2 }
          emptySlots[1]!.groupId = `自动_${room.roomId}`
          return true
        }
      }
      return false
    },
  },
  {
    id: 'penguin_trade',
    name: '企鹅物流贸易组',
    priority: 78,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const lappland = resolveId('拉普兰德')
      const texas = resolveId('德克萨斯')
      const exusiai = resolveId('能天使')
      const members = [lappland, texas, exusiai]
      if (!members.every(id => owned.has(id) && !lockedOps.has(id))) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (members.some(id => occupied.has(id))) return false

      const tRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'trading' && capacity(r.type, r.level) >= 3,
      )
      for (const room of tRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 3) {
          for (let i = 0; i < 3; i++) {
            emptySlots[i]!.occupant = { kind: 'operator', operatorId: members[i]! }
            emptySlots[i]!.groupId = `自动_${room.roomId}`
          }
          return true
        }
      }
      return false
    },
  },
  {
    id: 'waai_fu_aroma',
    name: '槐琥阿罗玛赤金',
    priority: 77,
    tryDeploy: (ws, owned, lockedPos, lockedOps) => {
      const waaifu = resolveId('槐琥')
      const aroma = resolveId('阿罗玛')
      if (!owned.has(waaifu) || !owned.has(aroma) || lockedOps.has(waaifu) || lockedOps.has(aroma)) return false

      const occupied = getOccupiedOperatorIds(ws)
      if (occupied.has(waaifu) || occupied.has(aroma)) return false

      const mRooms = Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' && r.product === 'gold' && capacity(r.type, r.level) >= 2,
      )
      mRooms.sort((a, b) => capacity(a.type, a.level) - capacity(b.type, b.level))

      for (const room of mRooms) {
        const emptySlots = room.slots.filter((s, idx) => s.occupant.kind === 'empty' && !lockedPos.has(`${room.roomId}:${idx}`))
        if (emptySlots.length >= 2) {
          emptySlots[0]!.occupant = { kind: 'operator', operatorId: waaifu }
          emptySlots[0]!.groupId = `组合_${room.roomId}`
          emptySlots[1]!.occupant = { kind: 'operator', operatorId: aroma }
          emptySlots[1]!.groupId = `组合_${room.roomId}`
          return true
        }
      }
      return false
    },
  },
]


export function runSmartRoster(
  base: RosterWorkspace,
  entries: readonly OwnedOperatorInput[],
  options: SmartRosterOptions = {},
  onProgress?: (p: SmartRosterProgress) => void,
): SmartRosterResult {
  const result: SmartRosterResult = {
    status: 'blocked',
    workspace: null,
    score: null,
    diagnostics: [],
    specialOperators: [],
    phases: {
      static: { candidates: [], bestScore: null },
      simulation: null,
      search: null,
    },
  }

  const seed = options.seed ?? 42
  const trials = options.trials ?? 5
  const maxStaticEvals = options.maxStaticEvals ?? 3000
  const simulationTopK = options.simulationTopK ?? 8
  const enableDeepSearch = options.enableDeepSearch ?? true
  const droneTarget = options.droneTarget ?? 'gold'

  // 1. Inventory & Base validation
  const inventory = compileOperatorInventory(entries)
  if (!inventory.valid) {
    result.diagnostics.push(...inventory.diagnostics)
    return result
  }

  const basePhysicalErrors = validatePhysicalRoster(base)
  if (basePhysicalErrors.length) {
    result.diagnostics.push(...basePhysicalErrors)
    return result
  }

  const hasProductionRoom = Object.values(base.mainPlan.facilities).some(
    r => r.type === 'manufacture' || r.type === 'trading'
  )
  if (!hasProductionRoom) {
    result.diagnostics.push({ code: 'NO_PRODUCTION_ROOM', message: '当前布局至少需要一个制造站或贸易站。' })
    return result
  }

  // Count occupied production/central slots in base
  let occupiedProductionSlots = 0
  for (const room of Object.values(base.mainPlan.facilities)) {
    if (room.type === 'manufacture' || room.type === 'trading' || room.type === 'power' || room.type === 'central') {
      for (const slot of room.slots) {
        if (slot.occupant.kind === 'operator') occupiedProductionSlots++
      }
    }
  }

  // If overwriteExisting is true or if production slots are substantially filled (> 5 slots),
  // we do not freeze all slots as locked; we re-optimize production and central for the layout.
  const shouldReoptimize = options.overwriteExisting ?? (occupiedProductionSlots > 5)

  // Identify user-locked positions and operators
  const lockedPositions = new Set<string>()
  const lockedOperators = new Set<string>()
  if (!shouldReoptimize) {
    for (const room of Object.values(base.mainPlan.facilities)) {
      if (room.type === 'dormitory') continue
      for (const [index, slot] of room.slots.entries()) {
        if (slot.occupant.kind === 'operator') {
          const id = resolveId(slot.occupant.operatorId)
          lockedPositions.add(`${room.roomId}:${index}`)
          lockedOperators.add(id)
        }
      }
    }
  }

  const eligibleOperators = inventory.operators.filter(
    o => o.matchesMaximumSkills && !isShiftRunOperator(o.charId) && o.name !== '菲亚梅塔'
  )

  const admittedTemplates = admitCombinationCandidates(inventory)
    .filter(a => a.status === 'needs-context')
    .map(a => a.candidate)
    .filter(c => {
      const contract = compileCandidateLayout(c)
      return !contract.temporal && !isDirtyMowerCombination(c)
    })

  // ==========================================
  // Phase 1: Static Greedy Construction
  // ==========================================
  onProgress?.({
    phase: 'building',
    phaseProgress: 0,
    currentTrial: 0,
    totalTrials: trials,
    label: '阶段 1/3: 静态贪心构建排班骨架...',
  })

  let totalEvaluations = 0
  const evaluateStatic = (w: RosterWorkspace) => {
    if (totalEvaluations >= maxStaticEvals) return null
    totalEvaluations++
    return projectRosterOutput(w)
  }

  const staticCandidates: SmartRosterCandidate[] = []

  for (let trialIndex = 0; trialIndex < trials; trialIndex++) {
    const trialSeed = (seed + trialIndex * 0x9e3779b9) >>> 0
    const nextRandom = randomGenerator(trialSeed)
    let ws = structuredClone(base)

    if (shouldReoptimize) {
      for (const room of Object.values(ws.mainPlan.facilities)) {
        if (room.type === 'manufacture' || room.type === 'trading' || room.type === 'power' || room.type === 'central') {
          for (const slot of room.slots) {
            slot.occupant = { kind: 'empty' }
            slot.groupId = null
            slot.replacements = []
          }
        }
      }
    }

    // Normalize slots to facility capacity
    for (const room of Object.values(ws.mainPlan.facilities)) {
      const cap = capacity(room.type, room.level)
      while (room.slots.length < cap) {
        room.slots.push({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })
      }
    }

    let currentScore = evaluateStatic(ws)?.daily.score ?? 0

    // Step A.2: Deploy Cohesive Synergy Archetypes
    const archetypePool = shuffle([...SYNERGY_ARCHETYPES], nextRandom)
    archetypePool.sort(
      (a, b) => b.priority + (nextRandom() * 10 - 5) - (a.priority + (nextRandom() * 10 - 5)),
    )

    const ownedEligibleCharIds = new Set(eligibleOperators.map((o) => o.charId))
    for (const arch of archetypePool) {
      if (totalEvaluations >= maxStaticEvals) break
      const checkpoint = structuredClone(ws)
      const deployed = arch.tryDeploy(ws, ownedEligibleCharIds, lockedPositions, lockedOperators)
      if (!deployed) {
        ws = checkpoint
        continue
      }

      const evalVal = evaluateStatic(ws)
      if (evalVal && evalVal.complete && evalVal.daily.score >= currentScore) {
        currentScore = evalVal.daily.score
      } else {
        ws = checkpoint
      }
    }

    // Step B: Combination Candidates
    const shuffledTemplates = shuffle(admittedTemplates, nextRandom)
    for (const candidate of shuffledTemplates) {
      if (totalEvaluations >= maxStaticEvals) break
      const attempt = generateRosterDraft(ws, entries, [candidate.id], { maxStates: 32 })
      if (!attempt.workspace) continue

      const evalScore = evaluateStatic(attempt.workspace)
      if (evalScore && evalScore.complete && evalScore.daily.score > currentScore) {
        ws = attempt.workspace
        currentScore = evalScore.daily.score
      }
    }

    // Step C: Singletons for remaining empty production slots
    const productionRooms = shuffle(
      Object.values(ws.mainPlan.facilities).filter(
        r => r.type === 'manufacture' || r.type === 'trading' || r.type === 'power'
      ),
      nextRandom
    )

    for (const room of productionRooms) {
      const cap = capacity(room.type, room.level)
      for (let slotIdx = 0; slotIdx < cap; slotIdx++) {
        if (totalEvaluations >= maxStaticEvals) break
        const slot = room.slots[slotIdx]
        if (!slot || slot.occupant.kind !== 'empty') continue

        const occupiedNow = getOccupiedOperatorIds(ws)
        const targetFacType = facilityTypes[room.type as keyof typeof facilityTypes]
        const pool = shuffle(
          eligibleOperators.filter(o => !occupiedNow.has(o.charId) && o.skills.some(s => s.roomType === targetFacType)),
          nextRandom
        ).slice(0, 16)

        let bestOpId: string | null = null
        let bestScore = -Infinity
        let bestPower = -Infinity
        for (const op of pool) {
          slot.occupant = { kind: 'operator', operatorId: op.charId }
          const evalVal = evaluateStatic(ws)
          slot.occupant = { kind: 'empty' }
          if (evalVal && evalVal.complete) {
            const s = evalVal.daily.score
            const p = evalVal.powerBonusPercent
            if (s > bestScore || (s === bestScore && p > bestPower) || bestOpId === null) {
              bestScore = s
              bestPower = p
              bestOpId = op.charId
            }
          }
        }

        if (!bestOpId && pool.length > 0) {
          bestOpId = pool[0]!.charId
        }

        if (bestOpId) {
          slot.occupant = { kind: 'operator', operatorId: bestOpId }
          currentScore = Math.max(currentScore, bestScore > -Infinity ? bestScore : currentScore)
        }
      }
    }

    // Step D: Central (Control Room) slots
    const centralRoom = ws.mainPlan.facilities.central
    if (centralRoom) {
      // D.1: Evaluate and apply cohesive central packages that synergize with active rooms
      const centralPackages: Array<{
        name: string
        operatorNames: string[]
        group: string
        condition?: (w: RosterWorkspace) => boolean
      }> = [
        {
          name: '深海中枢联动',
          operatorNames: ['歌蕾蒂娅'],
          group: '深海队',
          condition: (w) => {
            const occupied = getOccupiedOperatorIds(w)
            const abyssalIds = ['斯卡蒂', '乌尔比安', '幽灵鲨', '安哲拉'].map(resolveId)
            return abyssalIds.some((id) => occupied.has(id))
          },
        },
        {
          name: '红松林中枢联动',
          operatorNames: ['薇薇安娜', '焰尾'],
          group: '自动_central',
          condition: (w) => {
            const occupied = getOccupiedOperatorIds(w)
            const pinusIds = ['野鬃', '灰毫', '远牙'].map(resolveId)
            return pinusIds.some((id) => occupied.has(id))
          },
        },
        {
          name: '岁家感知烟火联动',
          operatorNames: ['令', '夕', '琴柳'],
          group: '自动_central',
          condition: (w) => {
            const occupied = getOccupiedOperatorIds(w)
            return occupied.has(resolveId('迷迭香')) || occupied.has(resolveId('乌有')) || occupied.has(resolveId('黑键'))
          },
        },
        {
          name: '黑钢国际中枢联动',
          operatorNames: ['涤火杰西卡'],
          group: '自动_central',
          condition: (w) => {
            const occupied = getOccupiedOperatorIds(w)
            return occupied.has(resolveId('水月')) || occupied.has(resolveId('香草')) || occupied.has(resolveId('杰西卡'))
          },
        },
        {
          name: '森蚺自动化中枢联动',
          operatorNames: ['森蚺'],
          group: '自动_central',
          condition: (w) => {
            const occupied = getOccupiedOperatorIds(w)
            return occupied.has(resolveId('温蒂'))
          },
        },
        {
          name: '叙拉古中枢联动',
          operatorNames: ['八幡海铃'],
          group: '自动_central',
          condition: (w) => {
            const occupied = getOccupiedOperatorIds(w)
            return occupied.has(resolveId('贝洛内')) || occupied.has(resolveId('伺夜'))
          },
        },
        {
          name: '格拉斯哥中枢联动',
          operatorNames: ['戴菲恩'],
          group: '自动_central',
          condition: (w) => {
            const occupied = getOccupiedOperatorIds(w)
            return occupied.has(resolveId('摩根')) || occupied.has(resolveId('推进之王'))
          },
        },
        {
          name: '喀兰贸易中枢联动',
          operatorNames: ['灵知'],
          group: '自动_central',
          condition: (w) => {
            const occupied = getOccupiedOperatorIds(w)
            return occupied.has(resolveId('银灰')) || occupied.has(resolveId('孑')) || occupied.has(resolveId('崖心'))
          },
        },
        {
          name: '凯尔希Mon3tr制造中枢',
          operatorNames: ['凯尔希', 'Mon3tr'],
          group: '自动_central',
        },
        {
          name: '星熊诗怀雅制造中枢',
          operatorNames: ['斩业星熊', '诗怀雅'],
          group: '自动_central',
        },
        {
          name: '阿米娅贸易中枢',
          operatorNames: ['阿米娅'],
          group: '自动_central',
        },
      ]

      for (const pkg of centralPackages) {
        if (totalEvaluations >= maxStaticEvals) break
        if (pkg.condition && !pkg.condition(ws)) continue

        const memberIds = pkg.operatorNames.map(resolveId)
        const occupiedNow = getOccupiedOperatorIds(ws)
        const canPlace = memberIds.every(
          (id) =>
            eligibleOperators.some((o) => o.charId === id) &&
            !occupiedNow.has(id) &&
            !lockedOperators.has(id),
        )
        if (!canPlace) continue

        const emptySlots = centralRoom.slots.filter((s) => s.occupant.kind === 'empty')
        if (emptySlots.length < memberIds.length) continue

        const placedSlots: typeof centralRoom.slots = []
        for (let i = 0; i < memberIds.length; i++) {
          const slot = emptySlots[i]!
          slot.occupant = { kind: 'operator', operatorId: memberIds[i]! }
          slot.groupId = pkg.group
          placedSlots.push(slot)
        }

        const evalVal = evaluateStatic(ws)
        if (evalVal && evalVal.complete && evalVal.daily.score >= currentScore) {
          currentScore = evalVal.daily.score
        } else {
          for (const slot of placedSlots) {
            slot.occupant = { kind: 'empty' }
            slot.groupId = null
          }
        }
      }

      // D.2: Fill remaining empty central slots with best singletons
      for (let slotIdx = 0; slotIdx < 5; slotIdx++) {
        if (totalEvaluations >= maxStaticEvals) break
        const slot = centralRoom.slots[slotIdx]
        if (!slot || slot.occupant.kind !== 'empty') continue

        const occupiedNow = getOccupiedOperatorIds(ws)
        const pool = shuffle(
          eligibleOperators.filter((o) => !occupiedNow.has(o.charId) && o.skills.some((s) => s.roomType === 'CONTROL')),
          nextRandom,
        ).slice(0, 16)

        let bestOpId: string | null = null
        let bestScore = -Infinity
        let bestPower = -Infinity
        for (const op of pool) {
          slot.occupant = { kind: 'operator', operatorId: op.charId }
          const evalVal = evaluateStatic(ws)
          slot.occupant = { kind: 'empty' }
          if (evalVal && evalVal.complete) {
            const s = evalVal.daily.score
            const p = evalVal.powerBonusPercent
            if (s > bestScore || (s === bestScore && p > bestPower) || bestOpId === null) {
              bestScore = s
              bestPower = p
              bestOpId = op.charId
            }
          }
        }

        if (!bestOpId && pool.length > 0) {
          bestOpId = pool[0]!.charId
        }

        if (bestOpId) {
          slot.occupant = { kind: 'operator', operatorId: bestOpId }
          currentScore = Math.max(currentScore, bestScore > -Infinity ? bestScore : currentScore)
        }
      }
    }

    // Step E: Fallback fill for any still-empty slot in production/central
    const fillTargetRooms = Object.values(ws.mainPlan.facilities).filter(
      (r) => r.type === 'manufacture' || r.type === 'trading' || r.type === 'power' || r.type === 'central',
    )
    for (const room of fillTargetRooms) {
      const cap = capacity(room.type, room.level)
      for (let slotIdx = 0; slotIdx < cap; slotIdx++) {
        const slot = room.slots[slotIdx]
        if (slot && slot.occupant.kind === 'empty') {
          const occupiedNow = getOccupiedOperatorIds(ws)
          const fallbackOp = eligibleOperators.find((o) => !occupiedNow.has(o.charId))
          if (fallbackOp) {
            slot.occupant = { kind: 'operator', operatorId: fallbackOp.charId }
          }
        }
      }
    }

    // Step F: Ensure dormitories have Free beds for remaining empty slots
    for (const room of Object.values(ws.mainPlan.facilities).filter((r) => r.type === 'dormitory')) {
      for (const slot of room.slots) {
        if (slot.occupant.kind === 'empty' && !slot.replacements.length) {
          slot.occupant = { kind: 'free' }
        }
      }
    }

    // Step G: Backups and Grouping Normalization
    const addedPositions: { roomId: MowerRoomId; slotIndex: number; operatorId: string }[] = []
    for (const room of Object.values(ws.mainPlan.facilities)) {
      if (room.type === 'dormitory') continue
      for (const [slotIdx, slot] of room.slots.entries()) {
        if (slot.occupant.kind === 'operator') {
          if (slot.replacements.length === 0) {
            addedPositions.push({ roomId: room.roomId, slotIndex: slotIdx, operatorId: slot.occupant.operatorId })
          }
        }
      }
    }

    if (addedPositions.length > 0) {
      assignBackups(ws, inventory, addedPositions)
    }

    normalizeWorkspaceGroups(ws, lockedPositions)

    // Step H: Physical validation & score
    const physErrors = validatePhysicalRoster(ws)
    const evalScore = evaluateStatic(ws)
    const valid = physErrors.length === 0 && evalScore !== null && evalScore.complete

    if (valid && evalScore) {
      staticCandidates.push({
        id: `trial_${trialIndex + 1}`,
        workspace: ws,
        staticScore: evalScore.daily.score,
        simScore: null,
        diagnostics: [],
      })
    }

    onProgress?.({
      phase: 'building',
      phaseProgress: (trialIndex + 1) / trials,
      currentTrial: trialIndex + 1,
      totalTrials: trials,
      bestScore: staticCandidates.length > 0 ? Math.max(...staticCandidates.map(c => c.staticScore)) : undefined,
      label: `阶段 1/3: 静态贪心构建轮次 ${trialIndex + 1}/${trials} 完成`,
    })
  }

  // 注入 Phase 0: 神经网络代理模型初筛产生的高分候选
  if (options.surrogateCandidates && options.surrogateCandidates.length > 0) {
    for (const sc of options.surrogateCandidates) {
      const physErrors = validatePhysicalRoster(sc.workspace)
      const evalScore = evaluateStatic(sc.workspace)
      if (physErrors.length === 0 && evalScore && evalScore.complete) {
        staticCandidates.push({
          id: sc.id || `surrogate_${staticCandidates.length + 1}`,
          workspace: sc.workspace,
          staticScore: evalScore.daily.score,
          simScore: null,
          diagnostics: [],
        })
      }
    }
  }

  // Deduplicate static candidates
  const seenFingerprints = new Set<string>()
  const uniqueCandidates = staticCandidates.filter(c => {
    const fp = workspaceFingerprint(c.workspace)
    if (seenFingerprints.has(fp)) return false
    seenFingerprints.add(fp)
    return true
  })

  uniqueCandidates.sort((a, b) => b.staticScore - a.staticScore)
  result.phases.static = {
    candidates: uniqueCandidates,
    bestScore: uniqueCandidates[0]?.staticScore ?? null,
  }

  if (uniqueCandidates.length === 0) {
    result.diagnostics.push({ code: 'NO_CANDIDATE_FOUND', message: '静态构建阶段未能生成满足约束的完整排班。' })
    return result
  }

  // ==========================================
  // Phase 2: Dynamic Simulation Verification
  // ==========================================
  const simCandidates = uniqueCandidates.slice(0, simulationTopK)
  onProgress?.({
    phase: 'simulating',
    phaseProgress: 0,
    totalTrials: simCandidates.length,
    label: `阶段 2/3: 仿真验证（Top-${simCandidates.length} 方案进行 1+3 天动态仿真）...`,
  })

  for (let idx = 0; idx < simCandidates.length; idx++) {
    const candidate = simCandidates[idx]!
    const simResponse = runScheduleSimulationBridge(
      candidate.workspace,
      {
        warmupHours: options.simulationWarmupHours ?? 24,
        sampleHours: options.simulationSampleHours ?? 72,
        maxStepHours: 0.25,
        production: {
          outputMode: 'potential',
          runOrderMode: 'natural',
          droneTarget,
          seed,
        },
        operatorInventory: [...entries],
      },
      {
        restingThreshold: 0.65,
        operationDurationHours: 0,
      }
    )

    if (simResponse.report && simResponse.report.success) {
      const rep = simResponse.report
      if (rep.production?.sample.completed) {
        const prodScore = scoreProduction(rep.production.sample.completed, rep.observedHours)
        candidate.simScore = prodScore.total
      } else {
        candidate.simScore = candidate.staticScore
      }

      // Collect simulated data for operators with special mood skills
      const specials: SpecialOperatorSimData[] = []
      for (const op of rep.operators) {
        if (hasConsumptionSkill(op.operatorId)) {
          specials.push({
            operatorId: op.operatorId,
            operatorName: op.operatorName,
            workFraction: op.workFraction,
            workRestRatio: op.workRestRatio,
            workHours: op.workHours,
            restHours: op.restHours,
            exhaustedHours: op.exhaustedHours,
            finalMorale: op.finalMorale,
          })
        }
      }
      candidate.specialOperators = specials
    } else {
      candidate.simScore = candidate.staticScore
      if (simResponse.error) {
        candidate.diagnostics.push(simResponse.error)
      }
    }

    onProgress?.({
      phase: 'simulating',
      phaseProgress: (idx + 1) / simCandidates.length,
      currentTrial: idx + 1,
      totalTrials: simCandidates.length,
      bestScore: Math.max(...simCandidates.map(c => c.simScore ?? c.staticScore)),
      label: `阶段 2/3: 仿真进度 ${idx + 1}/${simCandidates.length}（82分: ${candidate.simScore?.toFixed(1) ?? 'N/A'}）`,
    })
  }

  simCandidates.sort((a, b) => (b.simScore ?? b.staticScore) - (a.simScore ?? a.staticScore))
  const bestSimCandidate = simCandidates[0]!
  result.phases.simulation = {
    candidates: simCandidates,
    bestScore: bestSimCandidate.simScore ?? bestSimCandidate.staticScore,
  }

  let finalWorkspace = structuredClone(bestSimCandidate.workspace)
  let finalScore = bestSimCandidate.simScore ?? bestSimCandidate.staticScore
  result.specialOperators = bestSimCandidate.specialOperators ?? []

  // ==========================================
  // Phase 3: Neighborhood Deep Search
  // ==========================================
  if (enableDeepSearch) {
    onProgress?.({
      phase: 'searching',
      phaseProgress: 0,
      label: '阶段 3/3: 邻域深度微调 (Hill-Climb)...',
    })

    try {
      const searchResult = runRosterIncomeSearch(
        {
          baseline: finalWorkspace,
          inventory: [...entries],
          mode: 'hill-climb',
          maxCandidates: 8,
          maxDepth: 2,
          objective: 'composite',
          includeControlMains: true,
          includeProductionMains: true,
          options: {
            warmupHours: 24,
            sampleHours: 72,
            maxStepHours: 0.25,
            production: {
              outputMode: 'potential',
              runOrderMode: 'natural',
              droneTarget,
              seed,
            },
          },
        },
        progress => {
          onProgress?.({
            phase: 'searching',
            phaseProgress: progress.completedCandidates / Math.max(1, progress.totalCandidates),
            label: `阶段 3/3: 邻域微调 ${progress.label} (${progress.completedCandidates}/${progress.totalCandidates})`,
          })
        }
      )

      if (searchResult.bestCandidateId && searchResult.bestCandidateId !== 'baseline' && searchResult.bestWorkspace) {
        const gain = searchResult.candidates.find(c => c.id === searchResult.bestCandidateId)?.comparison?.minGain ?? 0
        result.phases.search = {
          improved: true,
          gain,
          result: searchResult,
        }
        finalWorkspace = searchResult.bestWorkspace
        finalScore += gain
      } else {
        result.phases.search = {
          improved: false,
          gain: 0,
          result: searchResult,
        }
      }
    } catch (searchErr) {
      // Graceful fallback to phase 2 best candidate
      result.phases.search = {
        improved: false,
        gain: 0,
      }
      result.diagnostics.push({
        code: 'SEARCH_FALLBACK',
        message: `邻域深度搜索未产生进一步改动：${searchErr instanceof Error ? searchErr.message : String(searchErr)}`,
      })
    }
  }

  // Post-processing: apply smart dormitory keepers
  applySmartDormitoryPolicy(finalWorkspace, {
    candidateOperatorIds: entries.map(e => e.operator),
    entries,
  })

  // Final group normalization ensures 100% mower_plan.json group compliance
  normalizeWorkspaceGroups(finalWorkspace, shouldReoptimize ? undefined : lockedPositions)

  result.status = 'draft'
  result.workspace = finalWorkspace
  result.score = finalScore

  onProgress?.({
    phase: 'done',
    phaseProgress: 1,
    bestScore: finalScore,
    label: `一键智能排班已完成，最终 82 综合评分：${finalScore.toFixed(1)} 分/日`,
  })

  return result
}
