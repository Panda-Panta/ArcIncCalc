// Mower compatibility semantics: ArkMowers/arknights-mower (MIT, Copyright 2021 Nano).
// See validation/mower-backup-2026-09-22/implementation-report.md for source contracts.
import { OPERATOR_MAP } from '../domain/operators'
import { resolveOperatorCharId as resolveId } from '../workbench/compat/mowerJson'
import type { MowerRoomId, RosterWorkspace } from '../workbench/model'
import { compileRosterSchedule } from './compileRosterSchedule'
import { compiledScheduleToRuntimeConfig } from './scheduleAdapter'
import type { CompiledSchedule } from './types'
import type { RuntimeState } from './rosterRuntime'

export const BACKUP_TIMINGS = { BEGINNING: 0, BEFORE_PLANNING: 300, AFTER_PLANNING: 600, END: 999 } as const
export type BackupTiming = keyof typeof BACKUP_TIMINGS
type Value = string | number | boolean
type Expression = (state: RuntimeState) => Value
const lists = ['rest_in_full', 'exhaust_require', 'workaholic', 'resting_priority', 'free_blacklist', 'refresh_trading', 'refresh_drained', 'ope_resting_priority'] as const
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const fail = (message: string): never => { throw new Error(`副表：${message}`) }
function operator(value: unknown): string {
  if (typeof value !== 'string' || !OPERATOR_MAP.has(resolveId(value))) return fail(`未知干员 ${String(value)}`)
  return resolveId(value)
}
export function actualRoom(state: RuntimeState, id: string): string {
  const position = state.config.positions.find(p => state.occupants[p.id] === id)
  return position?.roomId ?? state.config.beds.find(b => state.bedOccupants[b.id] === id)?.roomId ?? ''
}
function expression(source: unknown, participants: Set<string>, depth = 0, budget = { nodes: 0 }): Expression {
  if (depth > 32 || ++budget.nodes > 512) return fail('条件树超过限制')
  if (typeof source === 'number' && Number.isFinite(source) || typeof source === 'boolean') return () => source as Value
  if (typeof source === 'string') {
    const text = source.trim()
    if (/^(True|False)$/.test(text)) return () => text === 'True'
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) && Number.isFinite(Number(text))) return () => Number(text)
    const match = /^op_data\.operators\[['"]([^'"\[\]]+)['"]\]\.(is_resting\(\)|is_working\(\)|current_mood\(\)|current_room)$/.exec(text)
    if (match) {
      const id = operator(match[1]); participants.add(id)
      return state => {
        const room = actualRoom(state, id)
        switch (match[2]) {
          case 'is_resting()': return room.startsWith('dormitory_')
          case 'is_working()': return !!room && !room.startsWith('dormitory_')
          case 'current_room': return room
          default: return state.morale[id] ?? fail(`缺少 ${match[1]} 的心情`)
        }
      }
    }
    if (/^(?:room_[1-3]_[1-3]|dormitory_[1-4]|central|meeting|factory|contact|train)$/.test(text)) return () => text
    if (/^(['"])(?:room_[1-3]_[1-3]|dormitory_[1-4]|central|meeting|factory|contact|train|)\1$/.test(text)) return () => text.slice(1, -1)
    return fail(`不支持的条件 ${text}`)
  }
  if (!record(source)) return fail('条件必须为表达式树')
  const left = expression(source.left, participants, depth + 1, budget)
  const op = source.operator ?? ''
  if (op === '' && (source.right === '' || source.right === undefined)) return left
  if (!['and', 'or', '==', '!=', '<', '<=', '>', '>=', '+', '-', '*', '/'].includes(String(op))) return fail(`不支持的运算符 ${String(op)}`)
  const right = expression(source.right, participants, depth + 1, budget)
  return state => {
    const a = left(state)
    if (op === 'and') return Boolean(a) && Boolean(right(state))
    if (op === 'or') return Boolean(a) || Boolean(right(state))
    const b = right(state)
    if (op === '==') return a === b
    if (op === '!=') return a !== b
    if (typeof a !== 'number' || typeof b !== 'number') return fail('比较/算术运算需要数字')
    if (op === '<') return a < b
    if (op === '<=') return a <= b
    if (op === '>') return a > b
    if (op === '>=') return a >= b
    const value = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b
    if (!Number.isFinite(value)) return fail('条件运算结果不是有限数')
    return value
  }
}
export function evaluateBackupExpression(source: unknown, state: RuntimeState): Value {
  return expression(source, new Set())(state)
}
interface BackupPlan {
  name: string; timing: BackupTiming; condition: Expression
  slots: { room: MowerRoomId; index: number; agent: string; group: string | null; replacements: string[] }[]
  policies: Partial<Record<typeof lists[number], string[]>>
  task: Record<string, string[]>
}
function parsePlans(workspace: RosterWorkspace, participants: Set<string>): BackupPlan[] {
  const known = (value: unknown) => { const id = operator(value); participants.add(id); return id }
  return workspace.compatibility.backupPlans.map((raw, index) => {
    if (!record(raw)) return fail(`#${index + 1} 格式错误`)
    const name = typeof raw.name === 'string' ? raw.name : `#${index + 1}`
    try {
      const condition = expression(raw.trigger, participants)
      const timing = typeof raw.trigger_timing === 'string' ? raw.trigger_timing.toUpperCase() : ''
      const slots: BackupPlan['slots'] = [], task: BackupPlan['task'] = {}, policies: BackupPlan['policies'] = {}
      if (raw.plan !== undefined && !record(raw.plan) || raw.task !== undefined && !record(raw.task) || raw.conf !== undefined && !record(raw.conf)) fail('plan/task/conf 格式错误')
      for (const [room, data] of Object.entries(raw.plan ?? {})) {
        const facility = workspace.mainPlan.facilities[room as MowerRoomId]
        if (!facility || !record(data) || !Array.isArray(data.plans) || data.plans.length > facility.slots.length) fail(`计划房间/槽位错误 ${room}`)
        ;(data as { plans: unknown[] }).plans.forEach((slot, i) => {
          if (!record(slot) || typeof slot.agent !== 'string' || !Array.isArray(slot.replacement ?? [])) return fail(`计划槽位错误 ${room}.${i}`)
          if (slot.agent === 'Current') return
          if (slot.agent === 'Free' && facility.type !== 'dormitory') fail(`Free 只能用于宿舍 ${room}`)
          slots.push({ room: room as MowerRoomId, index: i, agent: slot.agent === 'Free' ? 'Free' : known(slot.agent), group: typeof slot.group === 'string' ? slot.group : null, replacements: (slot.replacement as unknown[] ?? []).map(known) })
        })
      }
      for (const key of lists) {
        const value = (raw.conf as Record<string, unknown> | undefined)?.[key] ?? ''
        const values = typeof value === 'string' ? value.replace(/，/g, ',').split(',').map(v => v.trim()).filter(Boolean) : Array.isArray(value) ? value : fail(`策略格式错误 ${key}`)
        policies[key] = values.map(known)
      }
      for (const [room, values] of Object.entries(raw.task ?? {})) {
        const facility = workspace.mainPlan.facilities[room as MowerRoomId]
        if (!facility || !Array.isArray(values) || values.length > facility.slots.length) fail(`任务房间/槽位错误 ${room}`)
        task[room] = (values as unknown[]).map(value => value === 'Current' || value === 'Free' ? value : known(value))
        if (facility.type !== 'dormitory' && task[room]!.includes('Free')) fail(`任务 Free 只能用于宿舍 ${room}`)
      }
      return { name, timing: timing in BACKUP_TIMINGS ? timing as BackupTiming : 'AFTER_PLANNING', condition, slots, policies, task }
    } catch (error) { return fail(`${name}：${error instanceof Error ? error.message : String(error)}`) }
  })
}
export function backupParticipants(workspace: RosterWorkspace): string[] {
  const participants = new Set<string>(); parsePlans(workspace, participants); return [...participants]
}

/** Keeps planned roles separate from physical occupancy; no morale/production reset. */
export function createBackupPlanController(base: CompiledSchedule, state: RuntimeState, options: { virtualRunners?: boolean; canUseFiammetta?: (id: string) => boolean } = {}) {
  base = structuredClone(base)
  const participants = new Set<string>(), plans = parsePlans(base.sourceWorkspace, participants)
  const active = plans.map(() => false)
  for (const id of participants) state.morale[id] ??= base.assumptions.operatorMorale[id] ?? base.assumptions.initialMorale
  let effective = base
  const remove = (id: string, occupants: Record<string, string>, beds: Record<string, string>) => {
    for (const [key, value] of Object.entries(occupants)) if (value === id) delete occupants[key]
    for (const [key, value] of Object.entries(beds)) if (value === id) delete beds[key]
  }
  const unique = (occupants: Record<string, string>, beds: Record<string, string>) => {
    const ids = [...Object.values(occupants), ...Object.values(beds)]
    if (new Set(ids).size !== ids.length) fail('任务造成重复占岗')
  }
  function evaluate(timing: BackupTiming): boolean {
    const next = plans.map((p, i) => BACKUP_TIMINGS[p.timing] <= BACKUP_TIMINGS[timing] ? Boolean(p.condition(state)) : active[i]!)
    if (next.every((value, i) => value === active[i])) return false
    const workspace = structuredClone(base.sourceWorkspace)
    workspace.compatibility.backupPlans = []
    next.forEach((enabled, i) => {
      if (!enabled) return
      const plan = plans[i]!
      for (const slot of plan.slots) workspace.mainPlan.facilities[slot.room].slots[slot.index] = {
        occupant: slot.agent === 'Free' ? { kind: 'free' } : { kind: 'operator', operatorId: slot.agent },
        groupId: slot.group, replacements: [...slot.replacements],
      }
      for (const key of lists) {
        const original = workspace.mainPlan.conf[key]
        const values = Array.isArray(original) ? original.map(value => resolveId(String(value))) : typeof original === 'string' ? original.split(',').filter(Boolean).map(resolveId) : []
        workspace.mainPlan.conf[key] = [...new Set([...values, ...(plan.policies[key] ?? [])])]
      }
    })
    const compiled = compileRosterSchedule(workspace, base.assumptions)
    if (compiled.diagnostics.some(d => d.severity === 'error' || d.code === 'UNKNOWN_OPERATOR')) fail(compiled.diagnostics.map(d => d.message).join('；'))
    const config = compiledScheduleToRuntimeConfig(compiled)
    // Preserve exclusions applied by the simulator (virtual runners / locked skill stages).
    if (options.virtualRunners) config.runOrderPolicies = []
    if (config.fiammetta && options.canUseFiammetta && !options.canUseFiammetta(config.fiammetta.operatorId)) config.fiammetta = undefined
    const primaries = config.positions.map(p => p.primary)
    if (new Set(primaries).size !== primaries.length) fail(`激活组合 ${next.map((v, i) => v ? plans[i]!.name : '').filter(Boolean).join('、')} 重复主班`)
    const previous = { ...state.occupants, ...state.bedOccupants }
    const resting = new Set([...Object.values(state.bedOccupants), ...state.config.positions.filter(p => p.dormitory).map(p => state.occupants[p.id]).filter(Boolean)])
    const occupants: Record<string, string> = {}, beds: Record<string, string> = {}
    for (const bed of config.beds) if (previous[bed.id]) beds[bed.id] = previous[bed.id]!
    for (const p of config.positions) {
      const old = previous[p.id]
      if (old) occupants[p.id] = old
    }
    // Reconcile the new plan for working primaries and fixed dormitory keepers.
    const assignments = config.positions.filter(p => state.config.positions.find(old => old.id === p.id)?.primary !== p.primary
      && (p.dormitory || !resting.has(p.primary) && Object.values(state.occupants).includes(p.primary)))
    for (const p of assignments) remove(p.primary, occupants, beds)
    for (const p of assignments) occupants[p.id] = p.primary
    const taskEvents: { index: number; operators: string[] }[] = []
    for (const [i, plan] of plans.entries()) {
      if (!next[i] || active[i] || !Object.keys(plan.task).length) continue
      const before = { ...occupants, ...beds }, targets: Record<string, string> = {}
      const explicit = Object.values(plan.task).flat().filter(agent => agent !== 'Current' && agent !== 'Free')
      if (new Set(explicit).size !== explicit.length) fail(`${plan.name} 任务重复干员`)
      for (const [room, slots] of Object.entries(plan.task)) slots.forEach((agent, index) => {
        const key = `${room}_${index}`
        // Moving an explicitly named operator necessarily vacates its old Current slot.
        const id = agent === 'Current' ? (before[key] && !explicit.includes(before[key]!) ? before[key] : undefined) : agent === 'Free' ? undefined : agent
        if (id) targets[key] = id
      })
      if (new Set(Object.values(targets)).size !== Object.values(targets).length) fail(`${plan.name} 任务重复干员`)
      for (const id of Object.values(targets)) remove(id, occupants, beds)
      for (const [room, slots] of Object.entries(plan.task)) slots.forEach((_, index) => {
        const key = `${room}_${index}`; delete occupants[key]; delete beds[key]
        if (!targets[key]) return
        if (config.beds.some(b => b.id === key)) beds[key] = targets[key]!
        else if (config.positions.some(p => p.id === key)) occupants[key] = targets[key]!
        else fail(`${plan.name} 任务目标没有有效岗位 ${key}`)
      })
      taskEvents.push({ index: i, operators: Object.values(targets) })
    }
    // A forced rest may vacate a work slot; reserve only an eligible real substitute.
    for (const p of config.positions.filter(p => !p.dormitory)) if (!occupants[p.id]) {
      const candidate = p.candidates.find(id => !primaries.includes(id) && !Object.values(occupants).includes(id) && !config.excludedCandidates?.includes(id))
      if (candidate) { remove(candidate, occupants, beds); occupants[p.id] = candidate }
    }
    // Explicit tasks can evict a resting primary. Keep its morale and queue a real
    // bed, rather than inventing capacity or silently forgetting that group member.
    const pendingRest = [...new Set([...(state.pendingRest ?? []), ...resting])].filter((id): id is string => Boolean(id) && primaries.includes(id!) && !Object.values(occupants).includes(id!) && !Object.values(beds).includes(id!))
    unique(occupants, beds)
    state.config = config; state.occupants = occupants; state.bedOccupants = beds; state.pendingRest = pendingRest
    state.returnDeadlines = {}; state.timingSignature = undefined
    effective = compiled
    next.forEach((value, i) => {
      if (value !== active[i]) state.events.push({ time: state.time, type: 'backup-plan', operators: [], backupIndex: i, backupName: plans[i]!.name, active: value, timing })
      active[i] = value
    })
    for (const task of taskEvents) state.events.push({ time: state.time, type: 'backup-task', operators: task.operators, backupIndex: task.index, backupName: plans[task.index]!.name, timing })
    return true
  }
  return { active, evaluate, get schedule() { return effective }, count: plans.length }
}
