import type { MowerFacilityType, MowerRoomId, RosterWorkspace } from '../workbench/model'
import { resolveOperatorCharId as resolveId } from '../workbench/compat/mowerJson'
import { OPERATOR_MAP } from '../domain/operators'
import { compileOperatorInventory, type OwnedOperatorInput } from '../domain/operatorInventory'
import { isShiftRunOperator } from '../scheduler/scheduleAdapter'
import { admitCombinationCandidates } from './inventoryAdmission'
import { compileCandidateLayout, generateRosterDraft, assignBackups, validatePhysicalRoster } from './rosterDraft'
import { CROSS_ROOM_TEMPLATES, crossRoomTemplateIssues, applyCrossRoomTemplate } from './crossRoomTemplates'
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

  // Identify user-locked positions and operators
  const lockedPositions = new Set<string>()
  const lockedOperators = new Set<string>()
  for (const room of Object.values(base.mainPlan.facilities)) {
    for (const [index, slot] of room.slots.entries()) {
      if (slot.occupant.kind === 'operator') {
        const id = resolveId(slot.occupant.operatorId)
        lockedPositions.add(`${room.roomId}:${index}`)
        lockedOperators.add(id)
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
      return !contract.temporal
    })

  const usableCrossTemplates = CROSS_ROOM_TEMPLATES.filter(t => crossRoomTemplateIssues(t).length === 0)

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

    // Normalize slots to facility capacity
    for (const room of Object.values(ws.mainPlan.facilities)) {
      const cap = capacity(room.type, room.level)
      while (room.slots.length < cap) {
        room.slots.push({ occupant: { kind: 'empty' }, groupId: null, replacements: [] })
      }
    }

    let currentScore = evaluateStatic(ws)?.daily.score ?? 0

    // Step A: Cross-room templates
    if (usableCrossTemplates.length > 0) {
      const shuffledCross = shuffle(usableCrossTemplates, nextRandom).slice(0, 8)
      for (const tpl of shuffledCross) {
        if (totalEvaluations >= maxStaticEvals) break
        // Check member conflict with locked operators
        const memberIds = tpl.members.map(m => OPERATOR_MAP.get(m.operatorName)?.charId ?? '')
        if (memberIds.some(id => !id || lockedOperators.has(id))) continue

        const draft = applyCrossRoomTemplate(ws, entries, tpl, 32)
        if (draft.workspace) {
          const evalScore = evaluateStatic(draft.workspace)
          if (evalScore && evalScore.complete && evalScore.daily.score > currentScore) {
            ws = draft.workspace
            currentScore = evalScore.daily.score
          }
        }
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
      for (let slotIdx = 0; slotIdx < 5; slotIdx++) {
        if (totalEvaluations >= maxStaticEvals) break
        const slot = centralRoom.slots[slotIdx]
        if (!slot || slot.occupant.kind !== 'empty') continue

        const occupiedNow = getOccupiedOperatorIds(ws)
        const pool = shuffle(
          eligibleOperators.filter(o => !occupiedNow.has(o.charId) && o.skills.some(s => s.roomType === 'CONTROL')),
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

    // Step E: Fallback fill for any still-empty slot in production/central
    const fillTargetRooms = Object.values(ws.mainPlan.facilities).filter(
      r => r.type === 'manufacture' || r.type === 'trading' || r.type === 'power' || r.type === 'central'
    )
    for (const room of fillTargetRooms) {
      const cap = capacity(room.type, room.level)
      for (let slotIdx = 0; slotIdx < cap; slotIdx++) {
        const slot = room.slots[slotIdx]
        if (slot && slot.occupant.kind === 'empty') {
          const occupiedNow = getOccupiedOperatorIds(ws)
          const fallbackOp = eligibleOperators.find(o => !occupiedNow.has(o.charId))
          if (fallbackOp) {
            slot.occupant = { kind: 'operator', operatorId: fallbackOp.charId }
          }
        }
      }
    }

    // Step F: Ensure dormitories have Free beds for remaining empty slots
    for (const room of Object.values(ws.mainPlan.facilities).filter(r => r.type === 'dormitory')) {
      for (const slot of room.slots) {
        if (slot.occupant.kind === 'empty' && !slot.replacements.length) {
          slot.occupant = { kind: 'free' }
        }
      }
    }

    // Step G: Grouping and Backups
    const addedPositions: { roomId: MowerRoomId; slotIndex: number; operatorId: string }[] = []
    for (const room of Object.values(ws.mainPlan.facilities)) {
      if (room.type === 'dormitory') continue
      for (const [slotIdx, slot] of room.slots.entries()) {
        if (slot.occupant.kind === 'operator') {
          const posKey = `${room.roomId}:${slotIdx}`
          if (!lockedPositions.has(posKey)) {
            if ((room.type === 'manufacture' || room.type === 'trading') && slot.groupId === null) {
              slot.groupId = `自动_${room.roomId}`
            }
          }
          if (slot.replacements.length === 0) {
            addedPositions.push({ roomId: room.roomId, slotIndex: slotIdx, operatorId: slot.occupant.operatorId })
          }
        }
      }
    }

    if (addedPositions.length > 0) {
      assignBackups(ws, inventory, addedPositions)
    }

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
  })

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
