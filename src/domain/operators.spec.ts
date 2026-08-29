import { describe, expect, it } from 'vitest'
import { OPERATORS, OPERATOR_PROFILE_COUNT, OPERATOR_SKILL_COUNT } from './operators'

describe('normalized RIIC operator data', () => {
  it('contains only selectable operators with at least one RIIC skill', () => {
    expect(OPERATOR_PROFILE_COUNT).toBe(425)
    expect(OPERATORS).toHaveLength(OPERATOR_PROFILE_COUNT)
    expect(OPERATORS.every((operator) => operator.skills.length > 0)).toBe(true)
  })

  it('keeps the expected highest-stage skill records', () => {
    expect(OPERATOR_SKILL_COUNT).toBe(746)
    expect(OPERATORS.flatMap((operator) => operator.skills)).toHaveLength(OPERATOR_SKILL_COUNT)
  })

  it('excludes mode-exclusive temporary operators', () => {
    const ids = new Set(OPERATORS.map((operator) => operator.charId))
    expect(ids.has('char_504_rguard')).toBe(false)
    expect(ids.has('char_609_acguad')).toBe(false)
  })
})
