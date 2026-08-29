import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './defaults'
import { EDITION } from './edition'

describe('calculator edition', () => {
  it('uses shift-run defaults on the shift-run branch', () => {
    const config = createDefaultConfig()
    const tradingRooms = config.rooms.filter((room) => room.type === 'trading')

    expect(EDITION.id).toBe('shift-run')
    expect(EDITION.allowShiftRun).toBe(true)
    expect(tradingRooms.every((room) => room.specialOrder === 'shiftRun')).toBe(true)
  })
})
