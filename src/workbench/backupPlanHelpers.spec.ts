import { describe, it, expect } from 'vitest'
import {
  serializeBackupTrigger,
  validateBackupTrigger,
  humanizeBackupTrigger,
  createDefaultBackupPlan,
  getFacilityRoomDisplayName,
  getFacilityMaxSlots,
  isDormitoryRoom,
  formatConfListToString,
  parseConfStringToOperatorNames,
} from './backupPlanHelpers'

describe('backupPlanHelpers', () => {
  describe('serializeBackupTrigger', () => {
    it('serializes string expressions directly', () => {
      expect(serializeBackupTrigger("op_data.operators['令'].is_resting() == True")).toBe("op_data.operators['令'].is_resting() == True")
    })

    it('serializes AST nodes into expression text', () => {
      const ast = {
        left: "op_data.operators['薇薇安娜'].is_resting()",
        operator: "and",
        right: "op_data.operators['阿罗玛'].is_working()",
      }
      expect(serializeBackupTrigger(ast)).toBe("(op_data.operators['薇薇安娜'].is_resting() and op_data.operators['阿罗玛'].is_working())")
    })

    it('handles nested AST nodes', () => {
      const nested = {
        left: {
          left: "op_data.operators['森蚺'].is_resting()",
          operator: "==",
          right: "True",
        },
        operator: "or",
        right: "False",
      }
      expect(serializeBackupTrigger(nested)).toBe("((op_data.operators['森蚺'].is_resting() == True) or False)")
    })

    it('handles empty / boolean / number values', () => {
      expect(serializeBackupTrigger(true)).toBe('True')
      expect(serializeBackupTrigger(false)).toBe('False')
      expect(serializeBackupTrigger(42)).toBe('42')
      expect(serializeBackupTrigger(null)).toBe('')
    })
  })

  describe('validateBackupTrigger', () => {
    it('validates correct expression and extracts participants', () => {
      const result = validateBackupTrigger("op_data.operators['令'].is_resting() == True")
      expect(result.valid).toBe(true)
      expect(result.participants).toContain('char_2023_ling')
    })

    it('validates correct AST node', () => {
      const result = validateBackupTrigger({
        left: "op_data.operators['薇薇安娜'].is_resting()",
        operator: "and",
        right: "op_data.operators['阿罗玛'].is_working()",
      })
      expect(result.valid).toBe(true)
      expect(result.participants).toHaveLength(2)
    })

    it('detects syntax error', () => {
      const result = validateBackupTrigger("op_data.operators['令'].is_resting( == True")
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('detects unknown operator error', () => {
      const result = validateBackupTrigger("op_data.operators['未知神秘人'].is_resting()")
      expect(result.valid).toBe(false)
      expect(result.error).toContain('未知干员')
    })
  })

  describe('humanizeBackupTrigger', () => {
    it('turns operator methods into readable Chinese summary', () => {
      const ast = {
        left: "op_data.operators['薇薇安娜'].is_resting()",
        operator: "and",
        right: "op_data.operators['阿罗玛'].is_working()",
      }
      const summary = humanizeBackupTrigger(ast)
      expect(summary).toContain('薇薇安娜休息中')
      expect(summary).toContain('且')
      expect(summary).toContain('阿罗玛工作中')
    })

    it('formats True / False nicely', () => {
      expect(humanizeBackupTrigger('True')).toBe('始终触发 (True)')
      expect(humanizeBackupTrigger('False')).toBe('不触发 (False)')
    })
  })

  describe('createDefaultBackupPlan', () => {
    it('creates a standard backup plan structure', () => {
      const plan = createDefaultBackupPlan(3)
      expect(plan.name).toBe('副表 #3')
      expect(plan.trigger_timing).toBe('BEFORE_PLANNING')
      expect(plan.trigger).toBe('True')
      expect(plan.task).toEqual({})
      expect(plan.conf?.ling_xi).toBe(1)
    })
  })

  describe('facility utilities', () => {
    it('maps facility room display names', () => {
      expect(getFacilityRoomDisplayName('central')).toBe('控制中枢')
      expect(getFacilityRoomDisplayName('dormitory_1')).toBe('宿舍 1')
      expect(getFacilityRoomDisplayName('room_2_1')).toBe('B201')
    })

    it('returns max slots', () => {
      expect(getFacilityMaxSlots('central')).toBe(5)
      expect(getFacilityMaxSlots('dormitory_3')).toBe(5)
      expect(getFacilityMaxSlots('room_1_1')).toBe(3)
      expect(getFacilityMaxSlots('meeting')).toBe(2)
      expect(getFacilityMaxSlots('contact')).toBe(1)
    })

    it('checks dormitory room', () => {
      expect(isDormitoryRoom('dormitory_1')).toBe(true)
      expect(isDormitoryRoom('room_1_1')).toBe(false)
    })

    it('parses and formats conf lists', () => {
      const parsed = parseConfStringToOperatorNames('令，夕, 薇薇安娜')
      expect(parsed).toEqual(['令', '夕', '薇薇安娜'])
      expect(formatConfListToString(['char_2023_ling', 'char_2013_cerber'])).toBe('令, 刻俄柏')
    })
  })
})
