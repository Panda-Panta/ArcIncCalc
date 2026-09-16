import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  parseMaaJson,
  parseMaaCsv,
  parseMaaMarkdown,
  parseYituliuXlsx,
  parseYituliuText,
  parseMaaExport,
  parseSklandExport,
  detectAndParseOperatorData,
  inventoryToCsvText,
  stripBom,
} from './operatorImport'

describe('operatorImport', () => {
  it('strips UTF-8 BOM properly', () => {
    expect(stripBom('\uFEFFhello')).toBe('hello')
    expect(stripBom('hello')).toBe('hello')
  })

  // 1. MAA JSON
  describe('MAA JSON', () => {
    it('parses MAA JSON export, strips BOM, and filters out unowned operators', () => {
      const sample = '\uFEFF' + JSON.stringify([
        { id: 'char_002_amiya', name: '阿米娅', elite: 2, level: 80, own: true },
        { id: 'char_1014_nearl2', name: '耀骑士临光', elite: 0, level: 0, own: false },
        { id: 'char_103_angel', name: '能天使', elite: 2, level: 90, own: true },
      ])
      const res = parseMaaJson(sample)
      expect(res.totalInFile).toBe(3)
      expect(res.unownedCount).toBe(1)
      expect(res.entries).toHaveLength(2)
      expect(res.entries.find(e => e.operator === '耀骑士临光')).toBeUndefined()
      expect(res.entries.find(e => e.operator === '阿米娅')).toEqual({ operator: '阿米娅', elitePhase: 2, level: 80 })
      expect(res.entries.find(e => e.operator === '能天使')).toEqual({ operator: '能天使', elitePhase: 2, level: 90 })
    })

    it('parses real MAA JSON file if available on disk', () => {
      const path = 'C:/Users/Panda-Panta/Downloads/干员练度/MAA/Arknights_OperBox_Export.json'
      if (existsSync(path)) {
        const raw = readFileSync(path, 'utf-8')
        const res = parseMaaJson(raw)
        expect(res.totalInFile).toBe(429)
        expect(res.unownedCount).toBe(24)
        expect(res.entries).toHaveLength(405)
      }
    })
  })

  // 2. MAA CSV
  describe('MAA CSV', () => {
    it('parses MAA CSV export with headers, resolves IDs, and filters out unowned operators', () => {
      const sample = '\uFEFF干员,ID,星级,精英化等级,等级,是否拥有,潜能\r\n' +
        '阿米娅,char_002_amiya,5,2,80,是,6\r\n' +
        '耀骑士临光,char_1014_nearl2,6,0,0,否,0\r\n' +
        '能天使,char_103_angel,6,2,90,是,2'
      const res = parseMaaCsv(sample)
      expect(res.totalInFile).toBe(3)
      expect(res.unownedCount).toBe(1)
      expect(res.entries).toHaveLength(2)
      expect(res.entries[0]).toEqual({ operator: '阿米娅', elitePhase: 2, level: 80 })
      expect(res.entries[1]).toEqual({ operator: '能天使', elitePhase: 2, level: 90 })
    })

    it('parses real MAA CSV file if available on disk', () => {
      const path = 'C:/Users/Panda-Panta/Downloads/干员练度/MAA/Arknights_OperBox_Export.csv'
      if (existsSync(path)) {
        const raw = readFileSync(path, 'utf-8')
        const res = parseMaaCsv(raw)
        expect(res.totalInFile).toBe(429)
        expect(res.unownedCount).toBe(24)
        expect(res.entries).toHaveLength(405)
      }
    })
  })

  // 3. MAA Markdown
  describe('MAA Markdown', () => {
    it('parses MAA Markdown table and filters out unowned operators', () => {
      const sample = '| 干员 | ID | 星级 | 精英化等级 | 等级 | 是否拥有 | 潜能 |\n' +
        '| :-- | :-- | :-- | :-- | :-- | :-- | :-- |\n' +
        '| 阿米娅 | char_002_amiya | 5 | 2 | 80 | 是 | 6 |\n' +
        '| 耀骑士临光 | char_1014_nearl2 | 6 | 0 | 0 | 否 | 0 |\n' +
        '| 能天使 | char_103_angel | 6 | 2 | 90 | 是 | 2 |'
      const res = parseMaaMarkdown(sample)
      expect(res.totalInFile).toBe(3)
      expect(res.unownedCount).toBe(1)
      expect(res.entries).toHaveLength(2)
      expect(res.entries[0]).toEqual({ operator: '阿米娅', elitePhase: 2, level: 80 })
      expect(res.entries[1]).toEqual({ operator: '能天使', elitePhase: 2, level: 90 })
    })

    it('parses real MAA Markdown file if available on disk', () => {
      const path = 'C:/Users/Panda-Panta/Downloads/干员练度/MAA/Arknights_OperBox_Export.md'
      if (existsSync(path)) {
        const raw = readFileSync(path, 'utf-8')
        const res = parseMaaMarkdown(raw)
        expect(res.totalInFile).toBe(429)
        expect(res.unownedCount).toBe(24)
        expect(res.entries).toHaveLength(405)
      }
    })
  })

  // 4. 一图流 (Yituliu)
  describe('Yituliu (一图流)', () => {
    it('parses real Yituliu XLSX file with Amiya merging and unrecruited filtering', () => {
      const path = 'C:/Users/Panda-Panta/Downloads/干员练度/一图流/一图流-干员练度表.xlsx'
      if (existsSync(path)) {
        const buf = readFileSync(path)
        const res = parseYituliuXlsx(buf)
        expect(res.totalInFile).toBe(431)
        expect(res.unownedCount).toBe(24)
        // 407 recruited rows, with 3 Amiya variants merged into 1 unique canonical entry -> 405 operators
        expect(res.entries).toHaveLength(405)
        const amiya = res.entries.find(e => e.operator === '阿米娅')
        expect(amiya).toEqual({ operator: '阿米娅', elitePhase: 2, level: 80 })
      }
    })

    it('parses Yituliu text table (CSV/TSV)', () => {
      const sample = '干员名称,是否已招募,星级,等级,精英化等级,潜能等级\n' +
        '结城理,1,6,70,2,1\n' +
        '谬因,0,6,0,0,0\n' +
        '阿米娅,1,5,80,2,6\n' +
        '阿米娅（近卫）,1,5,80,2,6'
      const res = parseYituliuText(sample)
      expect(res.totalInFile).toBe(4)
      expect(res.unownedCount).toBe(1)
      expect(res.entries).toHaveLength(2)
      expect(res.entries.find(e => e.operator === '结城理')).toBeDefined()
      expect(res.entries.find(e => e.operator === '阿米娅')).toBeDefined()
      expect(res.entries.find(e => e.operator === '谬因')).toBeUndefined()
    })
  })

  // 5. Universal Detection
  describe('Universal Detection', () => {
    it('automatically identifies MAA JSON, CSV, Markdown and Yituliu XLSX', () => {
      const jsonRes = detectAndParseOperatorData('[{"name":"能天使","elite":2,"level":90,"own":true}]')
      expect(jsonRes.source).toBe('maa')
      expect(jsonRes.entries).toHaveLength(1)

      const csvRes = detectAndParseOperatorData('干员,ID,星级,精英化等级,等级,是否拥有,潜能\n能天使,char_103_angel,6,2,90,是,2')
      expect(csvRes.source).toBe('maa')
      expect(csvRes.entries).toHaveLength(1)

      const mdRes = detectAndParseOperatorData('| 干员 | ID | 星级 | 精英化等级 | 等级 | 是否拥有 | 潜能 |\n| 能天使 | char_103_angel | 6 | 2 | 90 | 是 | 2 |')
      expect(mdRes.source).toBe('maa')
      expect(mdRes.entries).toHaveLength(1)

      const ytlTextRes = detectAndParseOperatorData('干员名称,是否已招募,星级,等级,精英化等级,潜能等级\n结城理,1,6,70,2,1')
      expect(ytlTextRes.source).toBe('yituliu')
      expect(ytlTextRes.entries).toHaveLength(1)
    })
  })

  // 6. Legacy & SKLand
  describe('SKLand & Legacy Text Lines', () => {
    it('parses legacy simple lines', () => {
      const raw = `银灰 2 90\n德克萨斯\t2\t80\n拉普兰德,2,70`
      const res = parseMaaExport(raw)
      expect(res).toHaveLength(3)
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
      expect(res[1]?.operator).toBe('能天使')
    })

    it('converts entries to CSV text format', () => {
      const csv = inventoryToCsvText([
        { operator: '银灰', elitePhase: 2, level: 90 },
        { operator: '德克萨斯', elitePhase: 2, level: 80 },
      ])
      expect(csv).toBe('银灰,2,90\n德克萨斯,2,80')
    })
  })
})
