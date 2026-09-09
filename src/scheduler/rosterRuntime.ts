import { applyFiammetta, type FiammettaPolicy } from './fiammettaPolicy'
import type { RunOrderPolicy } from './types'

export { compiledScheduleToRuntimeConfig, scheduleToRuntimeConfig, isShiftRunOperator } from './scheduleAdapter'

export const MORALE_EPSILON = 1e-8
export interface RuntimePosition {
  id: string; roomId: string; primary: string; candidates: string[]; group?: string
  lowerLimit?: number; upperLimit?: number; exhaustRequired?: boolean; restToFull?: boolean
  permanent?: boolean; dormitory?: boolean; restingPriority?: 'high' | 'low'
}
export interface RuntimeBed { id: string; roomId: string; vip: boolean }
export interface RuntimeConfig {
  positions: RuntimePosition[]; beds: RuntimeBed[]; initialMorale?: Record<string, number>
  fiammetta?: FiammettaPolicy; excludedCandidates?: string[]
  runOrderPolicies?: RunOrderPolicy[]
}
export interface RuntimeEvent {
  time: number; type: 'shift-off' | 'shift-on' | 'fiammetta'; operators: string[]
  beds?: string[]; moraleBefore?: number[]; moraleAfter?: number[]
}
export interface RuntimeState {
  config: RuntimeConfig; time: number; occupants: Record<string, string>; morale: Record<string, number>
  bedOccupants: Record<string, string>; events: RuntimeEvent[]
  diagnostics: { code: string; message: string }[]; lastFiammettaTime: number
}
export interface RuntimeRates {
  workRate: (operatorId: string, roomId: string, state: RuntimeState) => number
  recoveryRate: (operatorId: string, roomId: string, state: RuntimeState) => number
  /** Additional skill morale boundaries; callers can split intervals at non-roster events too. */
  thresholds?: (operatorId: string, state: RuntimeState) => number[]
}
export function createRosterRuntime(config: RuntimeConfig): RuntimeState {
  const s: RuntimeState = { config: structuredClone(config), time: 0, occupants: {}, morale: {}, bedOccupants: {}, events: [], diagnostics: [], lastFiammettaTime: -Infinity }
  const ids = new Set<string>()
  for (const p of config.positions) {
    if (s.occupants[p.id] || Object.values(s.occupants).includes(p.primary)) throw new Error('Duplicate roster occupancy')
    s.occupants[p.id] = p.primary
    ids.add(p.primary); p.candidates.forEach(id => ids.add(id))
  }
  if (new Set(config.beds.map(b => b.id)).size !== config.beds.length) throw new Error('Duplicate bed')
  if (config.fiammetta) { ids.add(config.fiammetta.operatorId); config.fiammetta.orderedTargets.forEach(id => ids.add(id)) }
  for (const id of ids) {
    const m = config.initialMorale?.[id] ?? 24
    if (!Number.isFinite(m) || m < 0 || m > 24) throw new Error(`Invalid morale: ${id}`)
    s.morale[id] = m
  }
  return s
}
const lower = (p: RuntimePosition) => p.exhaustRequired ? 0 : (p.lowerLimit ?? 0)
const upper = (p: RuntimePosition) => p.restToFull ? 24 : (p.upperLimit ?? 24)
export function rosterDiagnostic(s: RuntimeState, code: string, message: string) {
  if (!s.diagnostics.some(d => d.code === code && d.message === message)) s.diagnostics.push({ code, message })
}
function freeBed(s: RuntimeState, p: RuntimePosition, occupied: Record<string, string>) {
  return [...s.config.beds].sort((a, b) => p.restingPriority === 'low' ? Number(a.vip) - Number(b.vip) : Number(b.vip) - Number(a.vip)).find(b => !occupied[b.id])
}
/** Mower's ordinary replacement pass is ordered greedy reservation, without backtracking. */
export function nextCandidate(p: RuntimePosition, s: RuntimeState, reserved = new Set<string>(), activeBeds: Record<string, string> = s.bedOccupants) {
  return p.candidates.find(id => !s.config.excludedCandidates?.includes(id) && !reserved.has(id)
    && !Object.values(s.occupants).includes(id) && !Object.values(activeBeds).includes(id)
    && (s.morale[id] ?? 0) > lower(p) + MORALE_EPSILON)
}
export function settleRoster(s: RuntimeState): void {
  applyFiammetta(s)
  const groups = new Map<string, RuntimePosition[]>()
  for (const p of s.config.positions.filter(p => !p.dormitory && !p.permanent)) {
    const key = p.group ? `group:${p.group}` : `slot:${p.id}`
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  // Each group is evaluated once per timestamp: return cannot immediately trigger another shift.
  for (const [key, ps] of groups) {
    const resting = ps.every(p => s.occupants[p.id] !== p.primary)
    if (resting && ps.every(p => (s.morale[p.primary] ?? 0) >= upper(p) - MORALE_EPSILON)) {
      const covers = ps.map(p => s.occupants[p.id]!)
      for (const p of ps) {
        for (const [bed, id] of Object.entries(s.bedOccupants)) if (id === p.primary) delete s.bedOccupants[bed]
        s.occupants[p.id] = p.primary
      }
      covers.forEach((id, i) => {
        if ((s.morale[id] ?? 24) < 24 - MORALE_EPSILON) {
          const bed = freeBed(s, ps[i]!, s.bedOccupants)
          if (bed) s.bedOccupants[bed.id] = id
        }
      })
      s.events.push({ time: s.time, type: 'shift-on', operators: ps.map(p => p.primary) })
      continue
    }
    if (resting || !ps.some(p => (s.morale[p.primary] ?? 0) <= lower(p) + MORALE_EPSILON)) continue
    const reserved = new Set<string>(); const beds = { ...s.bedOccupants }; const swaps: { p: RuntimePosition; candidate: string; bed: string }[] = []
    for (const p of ps) {
      const candidate = nextCandidate(p, s, reserved, beds); const bed = freeBed(s, p, beds)
      if (!candidate || !bed) break
      reserved.add(candidate); beds[bed.id] = p.primary; swaps.push({ p, candidate, bed: bed.id })
    }
    if (swaps.length !== ps.length) { rosterDiagnostic(s, 'group-blocked', `${key}: insufficient available candidates or beds; original occupants retained`); continue }
    s.bedOccupants = beds
    for (const { p, candidate } of swaps) s.occupants[p.id] = candidate
    s.events.push({ time: s.time, type: 'shift-off', operators: ps.map(p => p.primary), beds: swaps.map(x => x.bed) })
  }
  // Rested substitutes become available without occupying a work slot.
  for (const [bed, id] of Object.entries(s.bedOccupants)) {
    if ((s.morale[id] ?? 0) >= 24 - MORALE_EPSILON && !s.config.positions.some(p => p.primary === id && s.occupants[p.id] !== id)) delete s.bedOccupants[bed]
  }
}
export function moraleDerivative(s: RuntimeState, id: string, rates: RuntimeRates): number {
  const p = s.config.positions.find(p => s.occupants[p.id] === id)
  const bed = s.config.beds.find(b => s.bedOccupants[b.id] === id)
  if (id === s.config.fiammetta?.operatorId && (p?.dormitory || bed)) return 2
  const rate = bed ? rates.recoveryRate(id, bed.roomId, s) : p ? (p.dormitory ? rates.recoveryRate(id, p.roomId, s) : -rates.workRate(id, p.roomId, s)) : 0
  if (!Number.isFinite(rate)) throw new Error(`Non-finite morale rate: ${id}`)
  return rate
}
export function nextRosterEventHours(s: RuntimeState, rates: RuntimeRates): number {
  let next = Infinity
  for (const [id, m] of Object.entries(s.morale)) {
    const rate = moraleDerivative(s, id, rates)
    if (!rate) continue
    const p = s.config.positions.find(p => p.primary === id)
    const thresholds = [0, 24, ...(p ? [lower(p), upper(p)] : []), ...(rates.thresholds?.(id, s) ?? [])]
    if (s.config.fiammetta?.orderedTargets.includes(id)) thresholds.push(s.config.fiammetta.threshold ?? 21.6)
    for (const threshold of thresholds) {
      const t = (threshold - m) / rate
      if (t > MORALE_EPSILON && t < next) next = t
    }
  }
  return next
}
export function advanceRoster(s: RuntimeState, hours: number, rates: RuntimeRates): void {
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('Roster advance must be finite and positive')
  const derivatives = Object.fromEntries(Object.keys(s.morale).map(id => [id, moraleDerivative(s, id, rates)]))
  for (const id of Object.keys(s.morale)) s.morale[id] = Math.max(0, Math.min(24, s.morale[id]! + derivatives[id]! * hours))
  s.time += hours
}
