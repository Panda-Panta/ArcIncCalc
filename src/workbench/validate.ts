import {
  MOWER_OUTPUT_ROOM_IDS,
  MOWER_ROOM_IDS,
  type MowerFacilityType,
  type MowerProduct,
  type MowerRoomId,
  type RosterWorkspace,
} from './model'

export type ValidationSeverity = 'critical' | 'warning' | 'info'

export type ValidationIssueCode =
  | 'DUPLICATE_OPERATOR'
  | 'CONFLICTING_REPLACEMENT'
  | 'DUPLICATE_REPLACEMENT'
  | 'SLOT_OVERFLOW'
  | 'INVALID_CONFIG'
  | 'POWER_DEFICIT'
  | 'NO_REPLACEMENT'
  | 'PLACEHOLDER_SLOT'
  | 'UNSUPPORTED_GAMING'

export interface ValidationIssue {
  readonly code: ValidationIssueCode
  readonly severity: ValidationSeverity
  readonly roomId: MowerRoomId
  readonly slotIndex?: number
  readonly message: string
}

export interface ValidationPowerSummary {
  readonly generation: number
  readonly consumption: number
  readonly margin: number
  readonly sufficient: boolean
}

export interface ValidationResult {
  readonly isValid: boolean
  readonly criticalErrors: ValidationIssue[]
  readonly warnings: ValidationIssue[]
  readonly issues: ValidationIssue[]
  readonly power: ValidationPowerSummary
}

// Source-backed power generation & consumption tables
const POWER_GENERATION: Record<number, number> = { 1: 60, 2: 130, 3: 270 }
const OUTPUT_POWER_CONSUMPTION: Record<number, number> = { 1: 10, 2: 30, 3: 60 }
const DORM_POWER_CONSUMPTION: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 45, 5: 65 }
const FUNCTIONAL_POWER_CONSUMPTION: Record<number, number> = { 1: 10, 2: 30, 3: 60 }

const VALID_MANUFACTURE_PRODUCTS: readonly MowerProduct[] = ['gold', 'exp', 'fragment']
const VALID_TRADING_PRODUCTS: readonly MowerProduct[] = ['money', 'orundum']

function getFacilityCapacity(type: MowerFacilityType, level: number): number {
  switch (type) {
    case 'manufacture':
    case 'trading':
      return Math.max(1, Math.min(3, level))
    case 'power':
    case 'contact':
    case 'factory':
      return 1
    case 'central':
    case 'dormitory':
      return 5
    case 'meeting':
    case 'train':
      return 2
    case 'gaming':
      return 1
    default:
      return 0
  }
}

export function validateRosterWorkspace(workspace: RosterWorkspace): ValidationResult {
  const criticalErrors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  const facilities = workspace.mainPlan.facilities

  // Track primary operators: operatorId -> { roomId, slotIndex }
  const primaryOperators = new Map<string, { roomId: MowerRoomId; slotIndex: number }>()

  // Track replacement operators globally: operatorId -> { roomId, slotIndex }
  const allReplacements = new Map<string, { roomId: MowerRoomId; slotIndex: number }>()

  // 1. First pass: Collect all active primary operators and check duplicates
  for (const roomId of MOWER_ROOM_IDS) {
    const facility = facilities[roomId]
    if (!facility) continue

    facility.slots.forEach((slot, slotIndex) => {
      if (slot.occupant.kind === 'operator') {
        const opId = slot.occupant.operatorId
        const existing = primaryOperators.get(opId)
        if (existing) {
          criticalErrors.push({
            code: 'DUPLICATE_OPERATOR',
            severity: 'critical',
            roomId,
            slotIndex,
            message: `干员 ${opId} 在 ${existing.roomId} 和 ${roomId} 同时在岗，不可重复指派主力。`,
          })
        } else {
          primaryOperators.set(opId, { roomId, slotIndex })
        }
      }
    })
  }

  // 2. Power calculation
  let totalGeneration = 0
  let totalConsumption = 0

  for (const roomId of MOWER_ROOM_IDS) {
    const facility = facilities[roomId]
    if (!facility) continue

    // Gaming is strictly excluded from power totals
    if (facility.type === 'gaming' || roomId.startsWith('gaming_')) {
      continue
    }

    if (facility.type === 'power') {
      totalGeneration += POWER_GENERATION[facility.level] ?? 0
    } else if (facility.type === 'manufacture' || facility.type === 'trading') {
      totalConsumption += OUTPUT_POWER_CONSUMPTION[facility.level] ?? 0
    } else if (facility.type === 'dormitory') {
      totalConsumption += DORM_POWER_CONSUMPTION[facility.level] ?? 0
    } else if (facility.type === 'meeting' || facility.type === 'contact' || facility.type === 'train') {
      totalConsumption += FUNCTIONAL_POWER_CONSUMPTION[facility.level] ?? 0
    } else if (facility.type === 'factory') {
      // Factory consumes fixed 10
      totalConsumption += 10
    }
    // Central consumes 0
  }

  if (totalConsumption > totalGeneration) {
    criticalErrors.push({
      code: 'POWER_DEFICIT',
      severity: 'critical',
      roomId: 'room_1_3',
      message: `基建总耗电量 (${totalConsumption}) 超过总发电量 (${totalGeneration})，存在电力赤字。`,
    })
  }

  // 3. Room-by-room constraint validation
  for (const roomId of MOWER_ROOM_IDS) {
    const facility = facilities[roomId]
    if (!facility) continue

    const isOutputRoom = (MOWER_OUTPUT_ROOM_IDS as readonly string[]).includes(roomId)

    // Facility Type & Level validation
    if (isOutputRoom) {
      if (facility.type !== 'manufacture' && facility.type !== 'trading' && facility.type !== 'power') {
        criticalErrors.push({
          code: 'INVALID_CONFIG',
          severity: 'critical',
          roomId,
          message: `${roomId} 为产出设施，类型必须为制造站、贸易站或发电站，当前为 ${facility.type}。`,
        })
      }
      if (facility.level < 1 || facility.level > 3) {
        criticalErrors.push({
          code: 'INVALID_CONFIG',
          severity: 'critical',
          roomId,
          message: `${roomId} 等级必须为 1~3 级，当前为 ${facility.level}。`,
        })
      }
      if (facility.type === 'manufacture') {
        if (facility.product && !VALID_MANUFACTURE_PRODUCTS.includes(facility.product)) {
          criticalErrors.push({
            code: 'INVALID_CONFIG',
            severity: 'critical',
            roomId,
            message: `制造站 ${roomId} 产物配置无效：${facility.product}，必须为赤金、作战记录或源石碎片。`,
          })
        }
      } else if (facility.type === 'trading') {
        if (facility.product && !VALID_TRADING_PRODUCTS.includes(facility.product)) {
          criticalErrors.push({
            code: 'INVALID_CONFIG',
            severity: 'critical',
            roomId,
            message: `贸易站 ${roomId} 产物配置无效：${facility.product}，必须为龙门币或源石订单。`,
          })
        }
      }
    } else if (roomId === 'central') {
      if (facility.type !== 'central' || facility.level < 1 || facility.level > 5) {
        criticalErrors.push({
          code: 'INVALID_CONFIG',
          severity: 'critical',
          roomId,
          message: `控制中枢等级必须为 1~5 级，当前等级 ${facility.level}，类型 ${facility.type}。`,
        })
      }
    } else if (roomId.startsWith('dormitory_')) {
      if (facility.type !== 'dormitory' || facility.level < 1 || facility.level > 5) {
        criticalErrors.push({
          code: 'INVALID_CONFIG',
          severity: 'critical',
          roomId,
          message: `宿舍 ${roomId} 等级必须为 1~5 级，当前等级 ${facility.level}，类型 ${facility.type}。`,
        })
      }
    } else if (roomId === 'meeting' || roomId === 'factory' || roomId === 'contact' || roomId === 'train') {
      if (facility.level < 1 || facility.level > 3) {
        criticalErrors.push({
          code: 'INVALID_CONFIG',
          severity: 'critical',
          roomId,
          message: `功能设施 ${roomId} 等级必须为 1~3 级，当前等级 ${facility.level}。`,
        })
      }
    } else if (roomId.startsWith('gaming_')) {
      // Check if gaming is configured
      const hasConfiguredOccupant = facility.slots.some((s) => s.occupant.kind !== 'empty')
      if (hasConfiguredOccupant) {
        warnings.push({
          code: 'UNSUPPORTED_GAMING',
          severity: 'warning',
          roomId,
          message: `活动室 (${roomId}) 暂不支持收益计算与电力模拟，已从电力总计中忽略。`,
        })
      }
    }

    // Capacity check
    const capacity = getFacilityCapacity(facility.type, facility.level)
    const activeStaff = facility.slots.filter((s) => s.occupant.kind !== 'empty').length
    if (activeStaff > capacity) {
      criticalErrors.push({
        code: 'SLOT_OVERFLOW',
        severity: 'critical',
        roomId,
        message: `${roomId} 的在岗人数 (${activeStaff}) 超过了设施等级容量 (${capacity})。`,
      })
    }

    // Slot-level validation
    facility.slots.forEach((slot, slotIndex) => {
      if (slot.occupant.kind === 'operator') {
        const opId = slot.occupant.operatorId

        // Missing replacements warning
        if (slot.replacements.length === 0) {
          warnings.push({
            code: 'NO_REPLACEMENT',
            severity: 'warning',
            roomId,
            slotIndex,
            message: `${roomId} 席位干员 (${opId}) 未配置替补。`,
          })
        }

        // Validate replacements
        const seenInSlot = new Set<string>()
        for (const repId of slot.replacements) {
          // Check duplicate replacement within same slot
          if (seenInSlot.has(repId)) {
            criticalErrors.push({
              code: 'DUPLICATE_REPLACEMENT',
              severity: 'critical',
              roomId,
              slotIndex,
              message: `${roomId} 席位的替补列表中存在重复干员：${repId}。`,
            })
          }
          seenInSlot.add(repId)

          // Check replacement conflicting with an active primary operator
          if (primaryOperators.has(repId)) {
            criticalErrors.push({
              code: 'CONFLICTING_REPLACEMENT',
              severity: 'critical',
              roomId,
              slotIndex,
              message: `替补干员 ${repId} 当前已作为主力在岗执勤，不可设为替补。`,
            })
          }

          // Check replacement overlapping across different slots
          const existingRep = allReplacements.get(repId)
          if (existingRep && (existingRep.roomId !== roomId || existingRep.slotIndex !== slotIndex)) {
            criticalErrors.push({
              code: 'DUPLICATE_REPLACEMENT',
              severity: 'critical',
              roomId,
              slotIndex,
              message: `替补干员 ${repId} 同时被 ${existingRep.roomId} 和 ${roomId} 指定为替补。`,
            })
          } else if (!existingRep) {
            allReplacements.set(repId, { roomId, slotIndex })
          }
        }
      } else if (slot.occupant.kind === 'free' || slot.occupant.kind === 'current') {
        warnings.push({
          code: 'PLACEHOLDER_SLOT',
          severity: 'warning',
          roomId,
          slotIndex,
          message: `${roomId} 席位使用 ${slot.occupant.kind} 占位，在收益模拟中将视为空席。`,
        })
      }
    })
  }

  const isValid = criticalErrors.length === 0

  return {
    isValid,
    criticalErrors,
    warnings,
    issues: [...criticalErrors, ...warnings],
    power: {
      generation: totalGeneration,
      consumption: totalConsumption,
      margin: totalGeneration - totalConsumption,
      sufficient: totalGeneration >= totalConsumption,
    },
  }
}
