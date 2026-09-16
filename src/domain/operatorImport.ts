import { OPERATORS, OPERATOR_MAP, type OperatorRecord } from './operators'
import type { OwnedOperatorInput } from './operatorInventory'
import { readXlsxRows } from './xlsxReader'

const OP_BY_NAME = new Map<string, OperatorRecord>()
const OP_BY_ID = new Map<string, OperatorRecord>()

for (const op of OPERATORS) {
  OP_BY_NAME.set(op.name, op)
  OP_BY_ID.set(op.charId, op)
}

/**
 * Strips leading UTF-8 Byte Order Mark (\uFEFF) if present.
 */
export function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1)
  }
  return text
}

/**
 * Resolves operator name or charId to canonical name registered in the database.
 * Normalizes multi-class Amiya entries from external tools to standard "阿米娅".
 */
export function resolveCanonicalOperatorName(identifier: string): string | null {
  const trimmed = identifier.trim()
  if (!trimmed) return null

  // Special alias normalization for Amiya class changes
  if (
    trimmed === '阿米娅（近卫）' ||
    trimmed === '阿米娅（医疗）' ||
    trimmed === '阿米娅（术师）' ||
    trimmed === '阿米娅(近卫)' ||
    trimmed === '阿米娅(医疗)' ||
    trimmed === '阿米娅(术师)'
  ) {
    return '阿米娅'
  }

  const byName = OP_BY_NAME.get(trimmed)
  if (byName) return byName.name

  const byId = OP_BY_ID.get(trimmed)
  if (byId) return byId.name

  const legacyFind = OPERATOR_MAP.get(trimmed) ?? OPERATORS.find(o => o.charId === trimmed)
  if (legacyFind) return legacyFind.name

  return trimmed
}

/**
 * Deduplicates operator entries, retaining the record with highest elitePhase and level.
 */
export function deduplicateOperatorEntries(entries: OwnedOperatorInput[]): OwnedOperatorInput[] {
  const map = new Map<string, OwnedOperatorInput>()
  for (const entry of entries) {
    const existing = map.get(entry.operator)
    if (!existing) {
      map.set(entry.operator, entry)
    } else {
      if (
        entry.elitePhase > existing.elitePhase ||
        (entry.elitePhase === existing.elitePhase && entry.level > existing.level)
      ) {
        map.set(entry.operator, entry)
      }
    }
  }
  return Array.from(map.values())
}

export interface OperatorImportSummary {
  source: 'maa' | 'yituliu' | 'skland' | 'generic'
  format: string
  entries: OwnedOperatorInput[]
  totalInFile: number
  unownedCount: number
  error?: string
}

/**
 * Parses MAA JSON export (Arknights_OperBox_Export.json or internal char_list).
 * Filters out entries with own === false.
 */
export function parseMaaJson(raw: string): { entries: OwnedOperatorInput[]; totalInFile: number; unownedCount: number } {
  const cleaned = stripBom(raw).trim()
  if (!cleaned) return { entries: [], totalInFile: 0, unownedCount: 0 }

  const json = JSON.parse(cleaned)
  const list = Array.isArray(json)
    ? json
    : Array.isArray(json.char_list)
    ? json.char_list
    : Array.isArray(json.characters)
    ? json.characters
    : Array.isArray(json.operators)
    ? json.operators
    : Array.isArray(json.data?.chars)
    ? json.data.chars
    : null

  if (!list) {
    throw new Error('未在 JSON 中找到干员列表数组')
  }

  const entries: OwnedOperatorInput[] = []
  let unownedCount = 0

  for (const item of list) {
    // Check ownership
    const isOwned = item.own === undefined ? true : Boolean(item.own)
    if (!isOwned) {
      unownedCount++
      continue
    }

    const nameOrId = item.name ?? item.charId ?? item.id ?? item.char_name
    if (!nameOrId) continue

    const canonicalName = resolveCanonicalOperatorName(String(nameOrId))
    if (!canonicalName) continue

    const elite = Number(item.elite ?? item.evolvePhase ?? item.elitePhase ?? item.phase ?? 0)
    const level = Number(item.level ?? 1)

    entries.push({
      operator: canonicalName,
      elitePhase: isNaN(elite) ? 0 : Math.max(0, Math.min(2, elite)),
      level: isNaN(level) ? 1 : Math.max(1, Math.min(90, level)),
    })
  }

  return {
    entries: deduplicateOperatorEntries(entries),
    totalInFile: list.length,
    unownedCount,
  }
}

/**
 * Parses MAA CSV export (Arknights_OperBox_Export.csv).
 * Header: 干员,ID,星级,精英化等级,等级,是否拥有,潜能
 */
export function parseMaaCsv(raw: string): { entries: OwnedOperatorInput[]; totalInFile: number; unownedCount: number } {
  const cleaned = stripBom(raw).trim()
  if (!cleaned) return { entries: [], totalInFile: 0, unownedCount: 0 }

  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { entries: [], totalInFile: 0, unownedCount: 0 }

  let nameCol = 0
  let idCol = 1
  let eliteCol = 3
  let levelCol = 4
  let ownCol = 5
  let startIndex = 0

  // Match header if present
  const firstParts = lines[0]!.split(',').map(s => s.trim())
  if (firstParts.some(p => p.includes('干员') || p.includes('精英') || p.includes('是否拥有') || p === 'ID')) {
    startIndex = 1
    const nIdx = firstParts.findIndex(p => p === '干员' || p === '干员名称' || p === '名称')
    const iIdx = firstParts.findIndex(p => p === 'ID' || p === 'id' || p === 'charId')
    const eIdx = firstParts.findIndex(p => p.includes('精英'))
    const lIdx = firstParts.findIndex(p => p === '等级')
    const oIdx = firstParts.findIndex(p => p.includes('拥有') || p.includes('招募'))

    if (nIdx !== -1) nameCol = nIdx
    if (iIdx !== -1) idCol = iIdx
    if (eIdx !== -1) eliteCol = eIdx
    if (lIdx !== -1) levelCol = lIdx
    if (oIdx !== -1) ownCol = oIdx
  }

  const entries: OwnedOperatorInput[] = []
  let unownedCount = 0
  let dataRowCount = 0

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!
    const parts = line.split(',').map(s => s.trim())
    if (parts.length < 3) continue
    dataRowCount++

    // Check ownership
    if (ownCol < parts.length) {
      const ownVal = parts[ownCol]!
      if (ownVal === '否' || ownVal === '0' || ownVal === 'false' || ownVal === 'FALSE') {
        unownedCount++
        continue
      }
    }

    const nameOrId = parts[nameCol] || parts[idCol]
    if (!nameOrId) continue

    const canonicalName = resolveCanonicalOperatorName(nameOrId)
    if (!canonicalName) continue

    const elite = Number(parts[eliteCol] ?? 0)
    const level = Number(parts[levelCol] ?? 1)

    entries.push({
      operator: canonicalName,
      elitePhase: isNaN(elite) ? 0 : Math.max(0, Math.min(2, elite)),
      level: isNaN(level) ? 1 : Math.max(1, Math.min(90, level)),
    })
  }

  return {
    entries: deduplicateOperatorEntries(entries),
    totalInFile: dataRowCount,
    unownedCount,
  }
}

/**
 * Parses MAA Markdown export (Arknights_OperBox_Export.md).
 * Table: | 干员 | ID | 星级 | 精英化等级 | 等级 | 是否拥有 | 潜能 |
 */
export function parseMaaMarkdown(raw: string): { entries: OwnedOperatorInput[]; totalInFile: number; unownedCount: number } {
  const cleaned = stripBom(raw).trim()
  if (!cleaned) return { entries: [], totalInFile: 0, unownedCount: 0 }

  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('|') && l.endsWith('|'))
  if (lines.length < 2) return { entries: [], totalInFile: 0, unownedCount: 0 }

  let nameCol = 0
  let idCol = 1
  let eliteCol = 3
  let levelCol = 4
  let ownCol = 5
  let startIndex = 0

  const headerCells = lines[0]!.slice(1, -1).split('|').map(s => s.trim())
  if (headerCells.some(p => p.includes('干员') || p.includes('精英') || p.includes('是否拥有'))) {
    startIndex = 1
    // Skip separator line if next is | :-- | ...
    if (lines.length > 1 && lines[1]!.includes('---') || lines[1]!.includes(':--')) {
      startIndex = 2
    }
    const nIdx = headerCells.findIndex(p => p === '干员' || p === '干员名称' || p === '名称')
    const iIdx = headerCells.findIndex(p => p === 'ID' || p === 'id')
    const eIdx = headerCells.findIndex(p => p.includes('精英'))
    const lIdx = headerCells.findIndex(p => p === '等级')
    const oIdx = headerCells.findIndex(p => p.includes('拥有') || p.includes('招募'))

    if (nIdx !== -1) nameCol = nIdx
    if (iIdx !== -1) idCol = iIdx
    if (eIdx !== -1) eliteCol = eIdx
    if (lIdx !== -1) levelCol = lIdx
    if (oIdx !== -1) ownCol = oIdx
  }

  const entries: OwnedOperatorInput[] = []
  let unownedCount = 0
  let dataRowCount = 0

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!
    if (line.includes('---') || line.includes(':--')) continue
    const cells = line.slice(1, -1).split('|').map(s => s.trim())
    if (cells.length < 3) continue
    dataRowCount++

    // Check ownership
    if (ownCol < cells.length) {
      const ownVal = cells[ownCol]!
      if (ownVal === '否' || ownVal === '0' || ownVal === 'false') {
        unownedCount++
        continue
      }
    }

    const nameOrId = cells[nameCol] || cells[idCol]
    if (!nameOrId) continue

    const canonicalName = resolveCanonicalOperatorName(nameOrId)
    if (!canonicalName) continue

    const elite = Number(cells[eliteCol] ?? 0)
    const level = Number(cells[levelCol] ?? 1)

    entries.push({
      operator: canonicalName,
      elitePhase: isNaN(elite) ? 0 : Math.max(0, Math.min(2, elite)),
      level: isNaN(level) ? 1 : Math.max(1, Math.min(90, level)),
    })
  }

  return {
    entries: deduplicateOperatorEntries(entries),
    totalInFile: dataRowCount,
    unownedCount,
  }
}

/**
 * Parses Yituliu (一图流) Excel export (.xlsx file buffer).
 * Columns: 干员名称 | 是否已招募 | 星级 | 等级 | 精英化等级 | 潜能等级...
 */
export function parseYituliuXlsx(data: ArrayBuffer | Uint8Array): { entries: OwnedOperatorInput[]; totalInFile: number; unownedCount: number } {
  const rows = readXlsxRows(data)
  if (rows.length === 0) return { entries: [], totalInFile: 0, unownedCount: 0 }

  let nameCol = 0
  let ownCol = 1
  let levelCol = 3
  let eliteCol = 4
  let startIndex = 1

  const header = rows[0]!
  const nIdx = header.findIndex(h => h.includes('干员') || h.includes('名称'))
  const oIdx = header.findIndex(h => h.includes('招募') || h.includes('拥有'))
  const lIdx = header.findIndex(h => h === '等级')
  const eIdx = header.findIndex(h => h.includes('精英'))

  if (nIdx !== -1) nameCol = nIdx
  if (oIdx !== -1) ownCol = oIdx
  if (lIdx !== -1) levelCol = lIdx
  if (eIdx !== -1) eliteCol = eIdx

  const entries: OwnedOperatorInput[] = []
  let unownedCount = 0
  let dataRowCount = 0

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i]!
    if (row.length === 0 || !row.some(Boolean)) continue
    dataRowCount++

    const isRecruited = row[ownCol]
    if (isRecruited !== '1' && isRecruited !== 'true' && isRecruited !== '是' && isRecruited !== 'TRUE') {
      unownedCount++
      continue
    }

    const rawName = row[nameCol]
    if (!rawName) continue

    const canonicalName = resolveCanonicalOperatorName(rawName)
    if (!canonicalName) continue

    const elite = Number(row[eliteCol] ?? 0)
    const level = Number(row[levelCol] ?? 1)

    entries.push({
      operator: canonicalName,
      elitePhase: isNaN(elite) ? 0 : Math.max(0, Math.min(2, elite)),
      level: isNaN(level) ? 1 : Math.max(1, Math.min(90, level)),
    })
  }

  return {
    entries: deduplicateOperatorEntries(entries),
    totalInFile: dataRowCount,
    unownedCount,
  }
}

/**
 * Parses Yituliu CSV or tab-delimited text if copied directly from website or table.
 */
export function parseYituliuText(raw: string): { entries: OwnedOperatorInput[]; totalInFile: number; unownedCount: number } {
  const cleaned = stripBom(raw).trim()
  if (!cleaned) return { entries: [], totalInFile: 0, unownedCount: 0 }

  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { entries: [], totalInFile: 0, unownedCount: 0 }

  // Detect delimiter: comma, tab, or whitespace
  const delimiter = lines[0]!.includes('\t') ? '\t' : lines[0]!.includes(',') ? ',' : /\s+/
  const header = lines[0]!.split(delimiter).map(s => s.trim())

  let nameCol = 0
  let ownCol = 1
  let levelCol = 3
  let eliteCol = 4
  let startIndex = 1

  const nIdx = header.findIndex(h => h.includes('干员') || h.includes('名称'))
  const oIdx = header.findIndex(h => h.includes('招募') || h.includes('拥有'))
  const lIdx = header.findIndex(h => h === '等级')
  const eIdx = header.findIndex(h => h.includes('精英'))

  if (nIdx !== -1) nameCol = nIdx
  if (oIdx !== -1) ownCol = oIdx
  if (lIdx !== -1) levelCol = lIdx
  if (eIdx !== -1) eliteCol = eIdx

  const entries: OwnedOperatorInput[] = []
  let unownedCount = 0
  let dataRowCount = 0

  for (let i = startIndex; i < lines.length; i++) {
    const row = lines[i]!.split(delimiter).map(s => s.trim())
    if (row.length < 3) continue
    dataRowCount++

    const isRecruited = row[ownCol]
    if (isRecruited !== '1' && isRecruited !== 'true' && isRecruited !== '是') {
      unownedCount++
      continue
    }

    const rawName = row[nameCol]
    if (!rawName) continue

    const canonicalName = resolveCanonicalOperatorName(rawName)
    if (!canonicalName) continue

    const elite = Number(row[eliteCol] ?? 0)
    const level = Number(row[levelCol] ?? 1)

    entries.push({
      operator: canonicalName,
      elitePhase: isNaN(elite) ? 0 : Math.max(0, Math.min(2, elite)),
      level: isNaN(level) ? 1 : Math.max(1, Math.min(90, level)),
    })
  }

  return {
    entries: deduplicateOperatorEntries(entries),
    totalInFile: dataRowCount,
    unownedCount,
  }
}

/**
 * Universal auto-detection entry point.
 * Accurately recognizes and parses:
 * - MAA JSON (.json)
 * - MAA CSV (.csv)
 * - MAA Markdown (.md)
 * - Yituliu XLSX (.xlsx)
 * - Yituliu CSV / Text
 * - SKLand JSON
 * - Legacy simple lines (干员名 2 90)
 */
export function detectAndParseOperatorData(
  input: string | ArrayBuffer | Uint8Array,
  fileName = '',
): OperatorImportSummary {
  const lowerName = fileName.toLowerCase()

  // 1. Binary XLSX detection (by filename or ZIP magic bytes 0x50 0x4B 0x03 0x04)
  if (typeof input !== 'string') {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      try {
        const res = parseYituliuXlsx(bytes)
        return {
          source: 'yituliu',
          format: '一图流 Excel 表格 (.xlsx)',
          entries: res.entries,
          totalInFile: res.totalInFile,
          unownedCount: res.unownedCount,
        }
      } catch (err: unknown) {
        return {
          source: 'yituliu',
          format: 'Excel 表格 (.xlsx)',
          entries: [],
          totalInFile: 0,
          unownedCount: 0,
          error: `解析 Excel 文件失败：${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }
  }

  // 2. Text-based detection
  const rawText = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input)
  const cleaned = stripBom(rawText).trim()

  if (!cleaned) {
    return {
      source: 'generic',
      format: '空内容',
      entries: [],
      totalInFile: 0,
      unownedCount: 0,
      error: '输入内容为空',
    }
  }

  // A. JSON format detection
  if (cleaned.startsWith('[') || cleaned.startsWith('{')) {
    try {
      const json = JSON.parse(cleaned)
      // Check if SKLand
      if (json.data?.chars || json.data?.list || (json.code !== undefined && json.data)) {
        const res = parseSklandExport(cleaned)
        return {
          source: 'skland',
          format: '森空岛角色数据 (JSON)',
          entries: res,
          totalInFile: res.length,
          unownedCount: 0,
        }
      }

      // MAA JSON
      const res = parseMaaJson(cleaned)
      return {
        source: 'maa',
        format: 'MAA 识别结果 (JSON)',
        entries: res.entries,
        totalInFile: res.totalInFile,
        unownedCount: res.unownedCount,
      }
    } catch {
      // Fall through if JSON parse fails
    }
  }

  // B. Markdown Table format detection
  if (cleaned.startsWith('|') || cleaned.includes('| 干员 |') || cleaned.includes('| ID |')) {
    const res = parseMaaMarkdown(cleaned)
    if (res.entries.length > 0) {
      return {
        source: 'maa',
        format: 'MAA 导出表格 (Markdown)',
        entries: res.entries,
        totalInFile: res.totalInFile,
        unownedCount: res.unownedCount,
      }
    }
  }

  // C. Yituliu CSV / Text detection (Header contains 干员名称 and 是否已招募)
  if (cleaned.includes('干员名称') && (cleaned.includes('是否已招募') || cleaned.includes('通用技能等级'))) {
    const res = parseYituliuText(cleaned)
    return {
      source: 'yituliu',
      format: '一图流表格文本 (CSV/TSV)',
      entries: res.entries,
      totalInFile: res.totalInFile,
      unownedCount: res.unownedCount,
    }
  }

  // D. MAA CSV detection (Header contains 干员 and 是否拥有 or ID)
  if (cleaned.includes('干员') && (cleaned.includes('是否拥有') || cleaned.includes('精英化等级') || lowerName.endsWith('.csv'))) {
    const res = parseMaaCsv(cleaned)
    if (res.entries.length > 0) {
      return {
        source: 'maa',
        format: 'MAA 导出数据 (CSV)',
        entries: res.entries,
        totalInFile: res.totalInFile,
        unownedCount: res.unownedCount,
      }
    }
  }

  // E. Fallback to general line-delimited format (name elite level)
  const legacyEntries = parseLegacyTextLines(cleaned)
  return {
    source: 'generic',
    format: '通用干员列表文本',
    entries: legacyEntries,
    totalInFile: legacyEntries.length,
    unownedCount: 0,
  }
}

function parseLegacyTextLines(raw: string): OwnedOperatorInput[] {
  const lines = raw.split(/\r?\n/)
  const results: OwnedOperatorInput[] = []
  for (const line of lines) {
    const parts = line.trim().split(/[,，\t\s]+/)
    if (parts.length >= 3 && /^\d+$/.test(parts[1]!) && /^\d+$/.test(parts[2]!)) {
      const canonicalName = resolveCanonicalOperatorName(parts[0]!)
      if (canonicalName) {
        results.push({
          operator: canonicalName,
          elitePhase: Number(parts[1]),
          level: Number(parts[2]),
        })
      }
    }
  }
  return deduplicateOperatorEntries(results)
}

/**
 * Parses MAA recognition result (JSON or delimited text lines).
 * Backwards-compatible facade.
 */
export function parseMaaExport(raw: string): OwnedOperatorInput[] {
  const summary = detectAndParseOperatorData(raw)
  return summary.entries
}

/**
 * Parses SKLand (森空岛) character inventory JSON.
 */
export function parseSklandExport(raw: string): OwnedOperatorInput[] {
  const trimmed = stripBom(raw).trim()
  if (!trimmed) return []

  try {
    const json = JSON.parse(trimmed)
    const chars = Array.isArray(json)
      ? json
      : Array.isArray(json.chars)
      ? json.chars
      : Array.isArray(json.data?.chars)
      ? json.data.chars
      : Array.isArray(json.data?.list)
      ? json.data.list
      : null

    if (chars) {
      const results: OwnedOperatorInput[] = []
      for (const item of chars) {
        const nameOrId = item.name ?? item.charId ?? item.id
        const elite = item.evolvePhase ?? item.elitePhase ?? item.elite ?? 0
        const level = item.level ?? 1
        if (nameOrId) {
          const canonicalName = resolveCanonicalOperatorName(String(nameOrId))
          if (canonicalName) {
            results.push({
              operator: canonicalName,
              elitePhase: Number(elite),
              level: Number(level),
            })
          }
        }
      }
      return deduplicateOperatorEntries(results)
    }
  } catch {
    // Failed JSON parse
  }
  return []
}

/**
 * Converts owned operator entries to standard storage CSV format (name,elite,level).
 */
export function inventoryToCsvText(entries: OwnedOperatorInput[]): string {
  return entries.map(e => `${e.operator},${e.elitePhase},${e.level}`).join('\n')
}
