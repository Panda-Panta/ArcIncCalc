import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './defaults'
import { EDITION } from './edition'

describe('calculator edition', () => {
  it('uses the non-shift-run defaults on the standard branch', () => {
    const config = createDefaultConfig()
    const tradingRooms = config.rooms.filter((room) => room.type === 'trading')

    expect(EDITION.id).toBe('standard')
    expect(EDITION.allowShiftRun).toBe(false)
    expect(tradingRooms.every((room) => room.specialOrder === 'none')).toBe(true)
  })
})
