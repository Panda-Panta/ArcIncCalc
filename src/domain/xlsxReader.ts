import { inflateRaw } from 'pako'

/**
 * Parses a standard OpenXML Spreadsheet (.xlsx) file in-memory.
 * Reads the first worksheet (sheet1.xml) and resolves shared strings (sharedStrings.xml) if present.
 * Returns a 2D array of string values (rows and cell strings).
 */
export function readXlsxRows(data: ArrayBuffer | Uint8Array): string[][] {
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(data)
  let pos = 0
  let sheetXml = ''
  const sharedStrings: string[] = []

  // Iterate over ZIP local file headers (0x04034b50)
  while (pos < buffer.length - 30) {
    if (
      buffer[pos] === 0x50 &&
      buffer[pos + 1] === 0x4b &&
      buffer[pos + 2] === 0x03 &&
      buffer[pos + 3] === 0x04
    ) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      const method = view.getUint16(pos + 8, true)
      const compSize = view.getUint32(pos + 18, true)
      const fnLen = view.getUint16(pos + 26, true)
      const extraLen = view.getUint16(pos + 28, true)

      const fnBytes = buffer.subarray(pos + 30, pos + 30 + fnLen)
      const fn = new TextDecoder('utf-8').decode(fnBytes)
      const dataStart = pos + 30 + fnLen + extraLen

      if (fn === 'xl/sharedStrings.xml') {
        const compData = buffer.subarray(dataStart, dataStart + compSize)
        const xml = method === 8
          ? new TextDecoder('utf-8').decode(inflateRaw(compData))
          : new TextDecoder('utf-8').decode(compData)
        const siMatches = xml.match(/<si>[\s\S]*?<\/si>/g) || []
        for (const si of siMatches) {
          const tMatches = [...si.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1] ?? '').join('')
          sharedStrings.push(tMatches)
        }
      } else if (fn === 'xl/worksheets/sheet1.xml' || (!sheetXml && fn.startsWith('xl/worksheets/sheet') && fn.endsWith('.xml'))) {
        const compData = buffer.subarray(dataStart, dataStart + compSize)
        sheetXml = method === 8
          ? new TextDecoder('utf-8').decode(inflateRaw(compData))
          : new TextDecoder('utf-8').decode(compData)
      }

      pos = dataStart + compSize
    } else {
      pos++
    }
  }

  if (!sheetXml) return []

  const rows: string[][] = []
  const rowMatches = sheetXml.match(/<row r="\d+"[\s\S]*?<\/row>/g) || []

  for (const rowXml of rowMatches) {
    const row: string[] = []
    // Match each cell: <c r="A1" t="s"><v>0</v></c> or <c r="A1" t="str"><v>text</v></c> or <c r="A1"><is><t>text</t></is></c>
    const cellMatches = [...rowXml.matchAll(/<c r="([A-Z]+)(\d+)"(?: [^>]*?t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)?<\/c>/g)]

    let maxCol = -1
    const cellMap = new Map<number, string>()
    for (const match of cellMatches) {
      const colLetters = match[1]!
      let colIdx = 0
      for (let i = 0; i < colLetters.length; i++) {
        colIdx = colIdx * 26 + (colLetters.charCodeAt(i) - 64)
      }
      colIdx -= 1 // 0-indexed column

      const type = match[3]
      const rawVal = match[4] ?? match[5] ?? ''
      let cellValue = rawVal

      if (type === 's') {
        const strIdx = Number(rawVal)
        cellValue = sharedStrings[strIdx] ?? rawVal
      } else if (type === 'b') {
        cellValue = rawVal === '1' ? '1' : '0'
      }

      cellMap.set(colIdx, cellValue.trim())
      if (colIdx > maxCol) maxCol = colIdx
    }

    for (let c = 0; c <= maxCol; c++) {
      row.push(cellMap.get(c) ?? '')
    }
    rows.push(row)
  }

  return rows
}
