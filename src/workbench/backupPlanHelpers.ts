import { compileBackupExpression } from '../scheduler/backupExpression'
import { getOperatorName } from './operatorHelpers'

export type BackupTiming = 'BEGINNING' | 'BEFORE_PLANNING' | 'AFTER_PLANNING' | 'END'

export interface MowerBackupPlanAstNode {
  left: unknown
  operator: string
  right: unknown
}

export type MowerBackupCondition = string | MowerBackupPlanAstNode

export interface MowerBackupPlanSlot {
  agent: string
  group?: string
  replacement?: string[]
}

export interface MowerBackupPlanFacilityOverride {
  name?: string
  product?: string
  plans: MowerBackupPlanSlot[]
}

export interface MowerBackupPlan {
  name: string
  trigger_timing: BackupTiming
  trigger: MowerBackupCondition
  task?: Record<string, string[]>
  plan?: Record<string, MowerBackupPlanFacilityOverride>
  conf?: Record<string, unknown>
}

export const BACKUP_TIMING_OPTIONS = [
  {
    label: '排班前 (BEFORE_PLANNING)',
    value: 'BEFORE_PLANNING' as BackupTiming,
    badge: '排班前',
    tagType: 'info' as const,
    description: '在进行常规换班规划前检查并执行（最常用）',
  },
  {
    label: '排班后 (AFTER_PLANNING)',
    value: 'AFTER_PLANNING' as BackupTiming,
    badge: '排班后',
    tagType: 'warning' as const,
    description: '在完成常规换班规划后检查并执行',
  },
  {
    label: '周期开始时 (BEGINNING)',
    value: 'BEGINNING' as BackupTiming,
    badge: '开始时',
    tagType: 'success' as const,
    description: '调度循环开始时立即检查',
  },
  {
    label: '周期结束时 (END)',
    value: 'END' as BackupTiming,
    badge: '结束时',
    tagType: 'default' as const,
    description: '调度循环全部完毕后检查',
  },
]

export const BACKUP_CONF_FIELDS = [
  { key: 'exhaust_require', label: '用尽心情 (exhaust_require)', placeholder: '心情耗尽才允许去宿舍休息的干员' },
  { key: 'rest_in_full', label: '回满上班 (rest_in_full)', placeholder: '心情充满才允许从宿舍上班的干员' },
  { key: 'workaholic', label: '工作狂 (workaholic)', placeholder: '允许 0 心情持续工作的干员' },
  { key: 'resting_priority', label: '低优先休息 (resting_priority)', placeholder: '宿舍床位不足时低优先级进驻的干员' },
  { key: 'free_blacklist', label: 'Free 黑名单 (free_blacklist)', placeholder: '自动填入宿舍 Free 空床时排除的干员' },
] as const

/**
 * Serialize trigger AST or primitive into python expression string.
 */
export function serializeBackupTrigger(source: unknown, depth = 0): string {
  if (depth > 32) return 'False'
  if (source === null || source === undefined) return ''
  if (typeof source === 'string') return source.trim()
  if (typeof source === 'boolean') return source ? 'True' : 'False'
  if (typeof source === 'number' && Number.isFinite(source)) return String(source)
  if (typeof source === 'object' && !Array.isArray(source)) {
    const node = source as Record<string, unknown>
    const left = serializeBackupTrigger(node.left, depth + 1)
    const op = typeof node.operator === 'string' ? node.operator.trim() : ''
    const right = serializeBackupTrigger(node.right, depth + 1)
    if (!op && !right) return left
    if (!left && !op) return right
    return `(${left} ${op} ${right})`.trim()
  }
  return ''
}

/**
 * Validate trigger condition using the actual backupExpression compiler.
 */
export function validateBackupTrigger(source: unknown): {
  valid: boolean
  error?: string
  skipped?: string
  participants: string[]
} {
  const participants = new Set<string>()
  try {
    const serialized = serializeBackupTrigger(source)
    if (!serialized) {
      return { valid: false, error: '条件表达式不能为空', participants: [] }
    }
    const result = compileBackupExpression(serialized, participants)
    return {
      valid: true,
      skipped: result.skipped,
      participants: Array.from(participants),
    }
  } catch (err: unknown) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
      participants: Array.from(participants),
    }
  }
}

/**
 * Convert trigger expression or AST to friendly human-readable summary.
 */
export function humanizeBackupTrigger(source: unknown): string {
  const str = serializeBackupTrigger(source)
  if (!str) return '未设置条件'
  if (str === 'True') return '始终触发 (True)'
  if (str === 'False') return '不触发 (False)'

  let text = str
  // Replace operator accessors: op_data.operators['干员'].is_working() -> [干员工作中]
  text = text.replace(
    /op_data\.operators\[['"]([^'"\[\]]+)['"]\]\.(is_working\(\)|is_resting\(\)|current_mood\(\)|current_room)/g,
    (_, opName, prop) => {
      if (prop === 'is_working()') return `${opName}工作中`
      if (prop === 'is_resting()') return `${opName}休息中`
      if (prop === 'current_mood()') return `${opName}心情`
      if (prop === 'current_room') return `${opName}所在房间`
      return `${opName}.${prop}`
    },
  )
  text = text.replace(/op_data\.party_time/g, '线索交流开启')
  text = text.replace(/\band\b/g, ' 且 ')
  text = text.replace(/\bor\b/g, ' 或 ')
  text = text.replace(/\bnot\b/g, ' 非 ')
  text = text.replace(/== True/g, '为真')
  text = text.replace(/== False/g, '为假')
  text = text.replace(/\s+/g, ' ').trim()

  // Clean redundant wrapping parentheses
  if (text.startsWith('(') && text.endsWith(')') && !text.slice(1, -1).includes(')')) {
    text = text.slice(1, -1).trim()
  }
  return text
}

export function createDefaultBackupPlan(index = 1): MowerBackupPlan {
  return {
    name: `副表 #${index}`,
    trigger_timing: 'BEFORE_PLANNING',
    trigger: 'True',
    task: {},
    plan: {},
    conf: {
      ling_xi: 1,
      exhaust_require: '',
      rest_in_full: '',
      resting_priority: '',
      workaholic: '',
      free_blacklist: '',
    },
  }
}

export function getFacilityRoomDisplayName(roomId: string): string {
  if (roomId === 'central') return '控制中枢'
  if (roomId === 'meeting') return '会客室'
  if (roomId === 'factory') return '加工站'
  if (roomId === 'contact') return '办公室'
  if (roomId === 'train') return '训练室'
  if (roomId === 'dormitory_1') return '宿舍 1'
  if (roomId === 'dormitory_2') return '宿舍 2'
  if (roomId === 'dormitory_3') return '宿舍 3'
  if (roomId === 'dormitory_4') return '宿舍 4'
  if (roomId.startsWith('room_')) {
    const parts = roomId.split('_')
    const floor = parts[1]
    const col = parts[2]
    return `B${floor}0${col}`
  }
  return roomId
}

export function getFacilityMaxSlots(roomId: string): number {
  if (roomId === 'central' || roomId.startsWith('dormitory_')) return 5
  if (roomId.startsWith('room_')) return 3
  if (roomId === 'meeting') return 2
  return 1
}

export function isDormitoryRoom(roomId: string): boolean {
  return roomId.startsWith('dormitory_')
}

export function formatConfListToString(val: unknown): string {
  if (Array.isArray(val)) {
    return val.map(id => getOperatorName(String(id))).join(', ')
  }
  if (typeof val === 'string') return val
  return ''
}

export function parseConfStringToOperatorNames(val: string): string[] {
  return val
    .replace(/，/g, ',')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(name => getOperatorName(name))
}
