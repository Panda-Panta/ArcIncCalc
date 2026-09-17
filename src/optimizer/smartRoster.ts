import type { RosterWorkspace } from '../workbench/model'
import { resolveOperatorCharId as resolveId } from '../workbench/compat/mowerJson'
import { compileOperatorInventory, type OwnedOperatorInput } from '../domain/operatorInventory'
import { projectRosterOutput } from './rosterProjection'
import { runScheduleSimulationBridge } from '../workbench/scheduleSimulationBridge'
import { scoreProduction } from './productionObjective'
import { hasConsumptionSkill } from './fixedDuty'
import { runRosterIncomeSearch, type IncomeSearchResult } from './rosterIncomeSearch'
import { validatePhysicalRoster } from './rosterDraft'
import { applySmartDormitoryPolicy } from '../scheduler/smartDormitoryPolicy'
import { generateMolecularCandidates } from './molecularSynthesis'

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

  // ==========================================
  // Phase 1: Indivisible Atomic-to-Molecular Synthesis
  // ==========================================
  onProgress?.({
    phase: 'building',
    phaseProgress: 0,
    currentTrial: 0,
    totalTrials: trials,
    label: '阶段 1/3: 不可分割原子组合与多分支分子合成...',
  })

  let totalEvaluations = 0
  const evaluateStatic = (w: RosterWorkspace) => {
    if (totalEvaluations >= maxStaticEvals) return null
    totalEvaluations++
    return projectRosterOutput(w)
  }

  const staticCandidates: SmartRosterCandidate[] = []
  const branchCount = Math.max(trials * 2, 8)
  const molecularBranches = generateMolecularCandidates(base, entries, inventory, {
    seed,
    branchCount,
    lockedPositions,
    lockedOperators,
    droneTarget,
  })

  for (let bIdx = 0; bIdx < molecularBranches.length; bIdx++) {
    const branch = molecularBranches[bIdx]!
    const evalScore = evaluateStatic(branch.workspace)
    staticCandidates.push({
      id: branch.id,
      workspace: branch.workspace,
      staticScore: evalScore?.daily.score ?? 0,
      simScore: null,
      diagnostics: [],
    })

    onProgress?.({
      phase: 'building',
      phaseProgress: (bIdx + 1) / molecularBranches.length,
      currentTrial: bIdx + 1,
      totalTrials: molecularBranches.length,
      bestScore: staticCandidates.length > 0 ? Math.max(...staticCandidates.map(c => c.staticScore)) : undefined,
      label: `阶段 1/3: 分子合成候选生成 ${bIdx + 1}/${molecularBranches.length} 完成`,
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
