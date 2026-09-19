import { runOrderInventoryDiagnostics } from './configureRunOrder'
import type { RosterWorkspace } from '../workbench/model'
import { resolveOperatorCharId as resolveId } from '../workbench/compat/mowerJson'
import { compileOperatorInventory, type OwnedOperatorInput } from '../domain/operatorInventory'
import { runScheduleSimulationBridge } from '../workbench/scheduleSimulationBridge'
import { scoreProduction } from './productionObjective'
import { hasConsumptionSkill } from './fixedDuty'
import { runRosterIncomeSearch, type IncomeSearchResult } from './rosterIncomeSearch'
import { validatePhysicalRoster } from './rosterDraft'
import { applySmartDormitoryPolicy } from '../scheduler/smartDormitoryPolicy'
import { generateMolecularCandidates } from './molecularSynthesis'
import { runGlobalPerCapitaReplacement } from './globalPerCapitaReplacement'
import { ALL_ATOMIC_CORE_NAMES } from './riicAtomicUnits'
import { isShiftRunOperator } from '../scheduler/scheduleAdapter'

export interface SmartRosterOptions {
  seed?: number
  branchCount?: number
  /** Legacy settings retained for old saved configurations; no longer control branch admission. */
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
    replacement?: {
      swappedCount: number
      logs: string[]
    }
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
  const trials = options.branchCount ?? 10
  if (!Number.isSafeInteger(trials) || trials < 1 || trials > 20) {
    result.diagnostics.push({ code: 'INVALID_BRANCH_COUNT', message: '有效分支数必须为 1–20 的整数。' })
    return result
  }
  const enableDeepSearch = options.enableDeepSearch ?? true
  const droneTarget = options.droneTarget ?? 'gold'

  // 1. Inventory & Base validation
  const inventory = compileOperatorInventory(entries)
  if (!inventory.valid) {
    result.diagnostics.push(...inventory.diagnostics)
    return result
  }

  const runOrderErrors = runOrderInventoryDiagnostics(base, inventory)
  if (runOrderErrors.length) {
    result.diagnostics.push(...runOrderErrors)
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
  // ==========================================
  // Phase 1: Indivisible Atomic-to-Molecular Synthesis
  // ==========================================
  onProgress?.({
    phase: 'building',
    phaseProgress: 0,
    currentTrial: 0,
    totalTrials: trials,
    label: '阶段 1/2: 不可分割原子组合与多分支分子合成...',
  })

  const branchCount = trials
  const molecularBranches = generateMolecularCandidates(base, entries, inventory, {
    seed,
    branchCount,
    lockedPositions,
    lockedOperators,
    droneTarget,
  })

  // Deduplicate candidates by layout fingerprint
  const seenFingerprints = new Set<string>()
  const uniqueCandidates: SmartRosterCandidate[] = []
  for (let bIdx = 0; bIdx < molecularBranches.length; bIdx++) {
    const branch = molecularBranches[bIdx]!
    const fp = workspaceFingerprint(branch.workspace)
    if (seenFingerprints.has(fp)) continue
    seenFingerprints.add(fp)

    uniqueCandidates.push({
      id: branch.id,
      workspace: branch.workspace,
      staticScore: 0,
      simScore: null,
      diagnostics: [],
    })

    onProgress?.({
      phase: 'building',
      phaseProgress: (bIdx + 1) / molecularBranches.length,
      currentTrial: bIdx + 1,
      totalTrials: molecularBranches.length,
      label: `阶段 1/2: 分子合成候选生成 ${bIdx + 1}/${molecularBranches.length} 完成`,
    })
  }

  if (uniqueCandidates.length < branchCount) {
    result.diagnostics.push({ code: 'INSUFFICIENT_UNIQUE_BRANCHES', message: `仅生成 ${uniqueCandidates.length}/${branchCount} 个不同且无布局冲突的分支，未启动模拟。请检查持有干员与锁定工位。` })
    return result
  }

  // ==========================================
  // Phase 2: Dynamic Simulation Verification (1+3 Days, 82 Formula)
  // Admit the complete distinct, physically valid branch set before simulating every member.
  // ==========================================
  const simCandidates = [...uniqueCandidates]
  onProgress?.({
    phase: 'simulating',
    phaseProgress: 0,
    totalTrials: simCandidates.length,
    label: `阶段 2/2: 全量动态拟真评估（预热 1 天 + 采样 3 天，82 综合评分）...`,
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
          runOrderMode: 'ideal',
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

    if (simResponse.report?.success) {
      const rep = simResponse.report
      if (rep.production?.sample.completed && rep.observedHours > 0) {
        const prodScore = scoreProduction(rep.production.sample.completed, rep.observedHours)
        candidate.simScore = prodScore.total
        candidate.staticScore = prodScore.total
      } else {
        candidate.simScore = 0
        candidate.staticScore = 0
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
      candidate.simScore = 0
      candidate.staticScore = 0
      if (simResponse.error) {
        candidate.diagnostics.push(simResponse.error)
      }
      if (simResponse.report?.diagnostics) {
        for (const d of simResponse.report.diagnostics) {
          candidate.diagnostics.push(`[${d.code}] ${d.message}`)
        }
      }
    }

    onProgress?.({
      phase: 'simulating',
      phaseProgress: (idx + 1) / simCandidates.length,
      currentTrial: idx + 1,
      totalTrials: simCandidates.length,
      bestScore: Math.max(...simCandidates.map(c => c.simScore ?? 0)),
      label: `阶段 2/2: 动态拟真进度 ${idx + 1}/${simCandidates.length}（82分: ${candidate.simScore?.toFixed(1) ?? '0.0'}）`,
    })
  }

  simCandidates.sort((a, b) => (b.simScore ?? 0) - (a.simScore ?? 0))
  const bestSimCandidate = simCandidates[0]!
  result.phases.static = {
    candidates: simCandidates,
    bestScore: bestSimCandidate.simScore ?? 0,
  }
  result.phases.simulation = {
    candidates: simCandidates,
    bestScore: bestSimCandidate.simScore ?? 0,
  }

  if (bestSimCandidate.simScore === null || bestSimCandidate.simScore <= 0) {
    result.status = 'blocked'
    result.workspace = bestSimCandidate.workspace
    result.score = 0
    const allCandidateDiags = Array.from(new Set(simCandidates.flatMap(c => c.diagnostics)))
    result.diagnostics.push({
      code: 'SIMULATION_EVALUATION_FAILED',
      message: `动态拟真计算未完成或产出为0。原因：${allCandidateDiags.length ? allCandidateDiags.join('；') : '候选方案未能通过动态拟真准入校验'}`,
    })
    return result
  }

  let finalWorkspace = structuredClone(bestSimCandidate.workspace)
  let finalScore = bestSimCandidate.simScore ?? 0
  result.specialOperators = bestSimCandidate.specialOperators ?? []

  // ==========================================
  // Phase 3: Global Per-Capita Replacement & Balance (Rule 6)
  // ==========================================
  onProgress?.({
    phase: 'searching',
    phaseProgress: 0.1,
    label: '阶段 3/3: 全局人均产出检测与优化置换...',
  })

  const currentPowerCount = Object.values(finalWorkspace.mainPlan.facilities).filter((r) => r.type === 'power').length
  const repResult = runGlobalPerCapitaReplacement(finalWorkspace, inventory, {
    powerCount: currentPowerCount,
    lockedPositions,
    lockedOperators,
    baselineScore: finalScore,
    evaluator: (candidateWs) => {
      try {
        const sim = runScheduleSimulationBridge(
          candidateWs,
          {
            warmupHours: options.simulationWarmupHours ?? 24,
            sampleHours: options.simulationSampleHours ?? 72,
            maxStepHours: 0.25,
            production: {
              outputMode: 'potential',
              runOrderMode: 'ideal',
              droneTarget,
              seed,
            },
            operatorInventory: [...entries],
          },
          {
            restingThreshold: 0.65,
            operationDurationHours: 0,
          },
        )
        if (sim.report?.success && sim.report.production?.sample.completed && sim.report.observedHours > 0) {
          return scoreProduction(sim.report.production.sample.completed, sim.report.observedHours).total
        }
      } catch {
        // simulation error
      }
      return 0
    },
  })
  result.phases.replacement = {
    swappedCount: repResult.swappedCount,
    logs: repResult.logs,
  }

  if (repResult.swappedCount > 0 && repResult.score && repResult.score > finalScore) {
    finalWorkspace = repResult.workspace
    finalScore = repResult.score
  }

  if (enableDeepSearch) {
    onProgress?.({
      phase: 'searching',
      phaseProgress: 0.5,
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
              runOrderMode: 'ideal',
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
    entries: [...entries],
    candidateOperatorIds: entries.map(e => e.operator),
    force: true,
  })

  // Requirement 2: Open meeting, factory, train for primary occupants and replacements
  const currentlyReservedAll = new Set(
    Object.values(finalWorkspace.mainPlan.facilities).flatMap((r) =>
      r.slots.flatMap((s) => [
        ...(s.occupant.kind === 'operator' ? [resolveId(s.occupant.operatorId)] : []),
        ...s.replacements.map(resolveId),
      ]),
    ),
  )

  for (const auxId of ['meeting', 'factory', 'train'] as const) {
    const fac = finalWorkspace.mainPlan.facilities[auxId]
    if (!fac) continue
    for (let sIdx = 0; sIdx < fac.slots.length; sIdx++) {
      const slot = fac.slots[sIdx]!
      if (slot.occupant.kind !== 'operator') {
        const freePrimary = inventory.operators.find(
          (o) =>
            o.matchesMaximumSkills &&
            !currentlyReservedAll.has(o.charId) &&
            !isShiftRunOperator(o.charId) &&
            !ALL_ATOMIC_CORE_NAMES.has(o.name) &&
            o.name !== '菲亚梅塔',
        )
        if (freePrimary) {
          slot.occupant = { kind: 'operator', operatorId: freePrimary.charId }
          slot.groupId = `${auxId}_辅助`
          currentlyReservedAll.add(freePrimary.charId)
        }
      }
      if (slot.occupant.kind === 'operator' && slot.replacements.length === 0) {
        const freeBackup = inventory.operators.find(
          (o) =>
            o.matchesMaximumSkills &&
            !currentlyReservedAll.has(o.charId) &&
            !isShiftRunOperator(o.charId) &&
            !ALL_ATOMIC_CORE_NAMES.has(o.name) &&
            o.name !== '菲亚梅塔',
        )
        if (freeBackup) {
          slot.replacements = [freeBackup.charId]
          currentlyReservedAll.add(freeBackup.charId)
        }
      }
    }
  }

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
