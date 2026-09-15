import { describe, it, expect } from 'vitest'
import { parseMaaExport, parseSklandExport, inventoryToCsvText } from './operatorImport'

describe('operatorImport', () => {
  it('parses MAA JSON export with char_list', () => {
    const raw = JSON.stringify({
      char_list: [
        { name: '银灰', elite: 2, level: 90 },
        { name: '德克萨斯', elite: 2, level: 80 },
      ],
    })
    const res = parseMaaExport(raw)
    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({ operator: '银灰', elitePhase: 2, level: 90 })
    expect(res[1]).toEqual({ operator: '德克萨斯', elitePhase: 2, level: 80 })
  })

  it('parses MAA plain text format', () => {
    const raw = `银灰 2 90\n德克萨斯\t2\t80\n拉普兰德,2,70`
    const res = parseMaaExport(raw)
    expect(res).toHaveLength(3)
    expect(res[0]).toEqual({ operator: '银灰', elitePhase: 2, level: 90 })
    expect(res[1]).toEqual({ operator: '德克萨斯', elitePhase: 2, level: 80 })
    expect(res[2]).toEqual({ operator: '拉普兰德', elitePhase: 2, level: 70 })
  })

  it('parses SKLand character list JSON', () => {
    const raw = JSON.stringify({
      code: 0,
      data: {
        chars: [
          { charId: 'char_002_amiya', evolvePhase: 2, level: 80 },
          { name: '能天使', evolvePhase: 2, level: 90 },
        ],
      },
    })
    const res = parseSklandExport(raw)
    expect(res).toHaveLength(2)
    expect(res[0]?.operator).toBe('阿米娅')
    expect(res[0]?.elitePhase).toBe(2)
    expect(res[0]?.level).toBe(80)
    expect(res[1]).toEqual({ operator: '能天使', elitePhase: 2, level: 90 })
  })

  it('converts entries to CSV text format', () => {
    const csv = inventoryToCsvText([
      { operator: '银灰', elitePhase: 2, level: 90 },
      { operator: '德克萨斯', elitePhase: 2, level: 80 },
    ])
    expect(csv).toBe('银灰,2,90\n德克萨斯,2,80')
  })
})
