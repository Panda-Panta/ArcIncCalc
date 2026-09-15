import { OPERATORS, OPERATOR_MAP } from './operators'
import type { OwnedOperatorInput } from './operatorInventory'

/**
 * Parses MAA recognition result (JSON or delimited text lines).
 */
export function parseMaaExport(raw: string): OwnedOperatorInput[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  try {
    const json = JSON.parse(trimmed)
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

    if (list) {
      const results: OwnedOperatorInput[] = []
      for (const item of list) {
        const nameOrId = item.name ?? item.charId ?? item.id ?? item.char_name
        const elite = item.elite ?? item.evolvePhase ?? item.elitePhase ?? item.phase ?? 0
        const level = item.level ?? 1
        if (nameOrId) {
          const op = OPERATOR_MAP.get(String(nameOrId)) ?? OPERATORS.find(o => o.charId === nameOrId)
          results.push({
            operator: op ? op.name : String(nameOrId),
            elitePhase: Number(elite),
            level: Number(level),
          })
        }
      }
      return results
    }
  } catch {
    // Not JSON, fallback to line-based parsing
  }

  const lines = trimmed.split(/\r?\n/)
  const results: OwnedOperatorInput[] = []
  for (const line of lines) {
    const parts = line.trim().split(/[,，\t\s]+/)
    if (parts.length >= 3 && /^\d+$/.test(parts[1]!) && /^\d+$/.test(parts[2]!)) {
      const op = OPERATOR_MAP.get(parts[0]!) ?? OPERATORS.find(o => o.charId === parts[0])
      results.push({
        operator: op ? op.name : parts[0]!,
        elitePhase: Number(parts[1]),
        level: Number(parts[2]),
      })
    }
  }
  return results
}

/**
 * Parses SKLand (森空岛) character inventory JSON.
 */
export function parseSklandExport(raw: string): OwnedOperatorInput[] {
  const trimmed = raw.trim()
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
          const op = OPERATOR_MAP.get(String(nameOrId)) ?? OPERATORS.find(o => o.charId === nameOrId)
          results.push({
            operator: op ? op.name : String(nameOrId),
            elitePhase: Number(elite),
            level: Number(level),
          })
        }
      }
      return results
    }
  } catch {
    // Failed JSON parse
  }
  return []
}

export function inventoryToCsvText(entries: OwnedOperatorInput[]): string {
  return entries.map(e => `${e.operator},${e.elitePhase},${e.level}`).join('\n')
}
