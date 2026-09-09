import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../domain/defaults'
import { currentMoraleRates } from './morale'

describe('current roster morale rate adapter', () => {
  it('evaluates only the supplied current roster without projecting a rotation', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = []
    config.rooms[0]!.operatorIds = ['char_237_gravel']
    config.operatorMorale = { char_237_gravel: 12 }
    config.operatorBackups = {}
    const copy = structuredClone(config)
    const result = currentMoraleRates(config)
    expect(result.rates.char_237_gravel).toBe(1)
    expect(config).toEqual(copy)
  })
  it('keeps zero-morale occupants in the assignment but excludes their active skills', () => {
    const config = createDefaultConfig()
    config.controlOperatorIds = ['char_002_amiya']
    config.rooms[0]!.operatorIds = ['char_237_gravel']
    config.operatorMorale = { char_002_amiya: 0, char_237_gravel: 12 }
    const result = currentMoraleRates(config)
    expect(result.rates.char_237_gravel).toBe(1)
    expect(result.rates.char_002_amiya).toBeUndefined()
  })
})
