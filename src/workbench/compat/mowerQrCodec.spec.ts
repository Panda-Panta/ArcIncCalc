// Derived from arknights-mower (https://github.com/ArkMowers/arknights-mower)
// Copyright (c) 2021 Nano
// MIT License

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { deflate } from 'pako'
import { encodeBase45 } from './base45'
import {
  QRCODE_SIZE,
  GAP_SIZE,
  TOP,
  BOTTOM,
  LEFT,
  RIGHT_PAIR_X,
  QR_COUNT,
  QR_SLOT_POSITIONS,
  MIN_CANVAS_WIDTH,
  MIN_CANVAS_HEIGHT,
  MIN_DECODE_WIDTH,
  MIN_DECODE_HEIGHT,
  MAX_WINDOW_ATTEMPTS,
  MAX_GLOBAL_ATTEMPTS,
} from './mowerQrConstants'
import {
  splitPayloadInto16Chunks,
  encodeRosterTo16QrChunks,
  decodeRosterFrom16QrChunks,
  render16QrToRgba,
  decode16QrFromRgba,
  exportRosterTo16Qr,
  decode16QrFromCanvas,
} from './mowerQrCodec'

const __dirname = dirname(fileURLToPath(import.meta.url))

function scaleBilinear(
  data: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  targetW: number,
  targetH: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(targetW * targetH * 4)
  const xRatio = (w - 1) / (targetW - 1 || 1)
  const yRatio = (h - 1) / (targetH - 1 || 1)
  for (let y = 0; y < targetH; y++) {
    const sy = y * yRatio
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, h - 1)
    const yWeight = sy - y0
    for (let x = 0; x < targetW; x++) {
      const sx = x * xRatio
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, w - 1)
      const xWeight = sx - x0
      const dstIdx = (y * targetW + x) * 4
      for (let c = 0; c < 4; c++) {
        const top =
          (data[(y0 * w + x0) * 4 + c] ?? 0) * (1 - xWeight) +
          (data[(y0 * w + x1) * 4 + c] ?? 0) * xWeight
        const bottom =
          (data[(y1 * w + x0) * 4 + c] ?? 0) * (1 - xWeight) +
          (data[(y1 * w + x1) * 4 + c] ?? 0) * xWeight
        out[dstIdx + c] = Math.round(top * (1 - yWeight) + bottom * yWeight)
      }
    }
  }
  return out
}

describe('Mower QR Codec', () => {
  describe('Layout Constants and Slot Coordinates', () => {
    it('has exact coordinate constants matching Python mower', () => {
      expect(QRCODE_SIZE).toBe(215)
      expect(GAP_SIZE).toBe(16)
      expect(TOP).toBe(40)
      expect(BOTTOM).toBe(995)
      expect(LEFT).toBe(40)
      expect(RIGHT_PAIR_X).toBe(2520)
      expect(QR_COUNT).toBe(16)
      expect(MIN_CANVAS_WIDTH).toBe(2735)
      expect(MIN_CANVAS_HEIGHT).toBe(1210)
    })

    it('computes exactly 16 slot coordinates: 7 top, 7 bottom-left, 2 bottom-right', () => {
      expect(QR_SLOT_POSITIONS.length).toBe(16)

      // Top row: indices 0..6
      for (let i = 0; i < 7; i++) {
        expect(QR_SLOT_POSITIONS[i]!.y).toBe(TOP)
        expect(QR_SLOT_POSITIONS[i]!.x).toBe(LEFT + i * (GAP_SIZE + QRCODE_SIZE))
      }
      expect(QR_SLOT_POSITIONS[0]!.x).toBe(40)
      expect(QR_SLOT_POSITIONS[6]!.x).toBe(40 + 6 * 231) // 1426

      // Bottom-left: indices 7..13
      for (let i = 0; i < 7; i++) {
        expect(QR_SLOT_POSITIONS[7 + i]!.y).toBe(BOTTOM)
        expect(QR_SLOT_POSITIONS[7 + i]!.x).toBe(LEFT + i * (GAP_SIZE + QRCODE_SIZE))
      }
      expect(QR_SLOT_POSITIONS[7]!.x).toBe(40)
      expect(QR_SLOT_POSITIONS[13]!.x).toBe(40 + 6 * 231) // 1426

      // Bottom-right: indices 14..15
      for (let i = 0; i < 2; i++) {
        expect(QR_SLOT_POSITIONS[14 + i]!.y).toBe(BOTTOM)
        expect(QR_SLOT_POSITIONS[14 + i]!.x).toBe(RIGHT_PAIR_X + i * (GAP_SIZE + QRCODE_SIZE))
      }
      expect(QR_SLOT_POSITIONS[14]!.x).toBe(2520)
      expect(QR_SLOT_POSITIONS[15]!.x).toBe(2520 + 231) // 2751
    })
  })

  describe('splitPayloadInto16Chunks floor step parity with Python', () => {
    it('uses floor step and concatenates back to original string', () => {
      const payload = 'A'.repeat(1748)
      const chunks = splitPayloadInto16Chunks(payload)
      expect(chunks.length).toBe(16)
      expect(chunks.join('')).toBe(payload)

      // In Python:
      // length // 16 = 1748 // 16 = 109
      // For i in 0..14: start = 109 * i, end = 109 * (i + 1) -> length 109
      // For i == 15: start = 109 * 15 = 1635, end = 1748 -> length 113
      for (let i = 0; i < 15; i++) {
        expect(chunks[i]!.length).toBe(109)
      }
      expect(chunks[15]!.length).toBe(113)
    })

    it('handles non-divisible short lengths matching Python floor', () => {
      const payload = 'ABCDEFGHIJKLMNOPQ' // 17 chars
      const chunks = splitPayloadInto16Chunks(payload)
      expect(chunks.length).toBe(16)
      expect(chunks.join('')).toBe(payload)
      // 17 // 16 = 1
      for (let i = 0; i < 15; i++) {
        expect(chunks[i]!.length).toBe(1)
      }
      expect(chunks[15]!.length).toBe(2)
    })

    it('handles exact divisible length', () => {
      const payload = '0123456789ABCDEF' // 16 chars
      const chunks = splitPayloadInto16Chunks(payload)
      expect(chunks.length).toBe(16)
      expect(chunks.join('')).toBe(payload)
      for (let i = 0; i < 16; i++) {
        expect(chunks[i]!.length).toBe(1)
      }
    })
  })

  describe('encodeRosterTo16QrChunks & decodeRosterFrom16QrChunks', () => {
    it('roundtrips Chinese JSON text', () => {
      const sampleObj = {
        plan: '252极限排班',
        rooms: [
          { name: '制造站B101', operators: ['桃金娘', '极境', '琴柳'] },
          { name: '贸易站B102', operators: ['德克萨斯', '拉普兰德', '能天使'] },
        ],
        author: '测试人员',
        notes: 'UTF-8中文与特殊符号~!@#$%^&*()_+',
      }
      const jsonText = JSON.stringify(sampleObj)
      const chunks = encodeRosterTo16QrChunks(jsonText)
      expect(chunks.length).toBe(16)

      const decodedText = decodeRosterFrom16QrChunks(chunks)
      expect(decodedText).toBe(jsonText)
      expect(JSON.parse(decodedText)).toEqual(sampleObj)
    })

    it('roundtrips mower-252-3gold.json fixture content', () => {
      const jsonText = readFileSync(resolve(__dirname, 'fixtures', 'mower-252-3gold.json'), 'utf-8')
      const originalObj = JSON.parse(jsonText)

      const chunks = encodeRosterTo16QrChunks(jsonText)
      expect(chunks.length).toBe(16)

      const decodedText = decodeRosterFrom16QrChunks(chunks)
      const parsedObj = JSON.parse(decodedText)
      expect(parsedObj).toEqual(originalObj)
    })
  })

  describe('Decoding real mower JPG fixture', () => {
    it('decodes mower-252-sample.jpg and deep equals mower-252-3gold.json', () => {
      const jpgBuffer = readFileSync(resolve(__dirname, 'fixtures', 'mower-252-sample.jpg'))
      const rawImage = jpeg.decode(jpgBuffer, { useTArray: true })
      expect(rawImage.width).toBeGreaterThanOrEqual(MIN_CANVAS_WIDTH)
      expect(rawImage.height).toBeGreaterThanOrEqual(MIN_CANVAS_HEIGHT)

      const decodedJsonText = decode16QrFromRgba(rawImage.data, rawImage.width, rawImage.height)
      const decodedPlan = JSON.parse(decodedJsonText)

      const expectedJsonText = readFileSync(
        resolve(__dirname, 'fixtures', 'mower-252-3gold.json'),
        'utf-8'
      )
      const expectedPlan = JSON.parse(expectedJsonText)

      expect(decodedPlan).toEqual(expectedPlan)
    })

    it('decodes mower-252-sample.jpg scaled down to 75% and deep equals mower-252-3gold.json', () => {
      const jpgBuffer = readFileSync(resolve(__dirname, 'fixtures', 'mower-252-sample.jpg'))
      const rawImage = jpeg.decode(jpgBuffer, { useTArray: true })
      const targetW = Math.round(rawImage.width * 0.75) // 2259
      const targetH = Math.round(rawImage.height * 0.75) // 927
      const scaledData = scaleBilinear(rawImage.data, rawImage.width, rawImage.height, targetW, targetH)

      const decodedJsonText = decode16QrFromRgba(scaledData, targetW, targetH)
      const decodedPlan = JSON.parse(decodedJsonText)

      const expectedJsonText = readFileSync(
        resolve(__dirname, 'fixtures', 'mower-252-3gold.json'),
        'utf-8'
      )
      const expectedPlan = JSON.parse(expectedJsonText)

      expect(decodedPlan).toEqual(expectedPlan)
    })

    it('decodes mower-252-sample.jpg scaled down to 50% and deep equals mower-252-3gold.json', () => {
      const jpgBuffer = readFileSync(resolve(__dirname, 'fixtures', 'mower-252-sample.jpg'))
      const rawImage = jpeg.decode(jpgBuffer, { useTArray: true })
      const targetW = Math.round(rawImage.width * 0.5) // 1506
      const targetH = Math.round(rawImage.height * 0.5) // 618
      const scaledData = scaleBilinear(rawImage.data, rawImage.width, rawImage.height, targetW, targetH)

      const decodedJsonText = decode16QrFromRgba(scaledData, targetW, targetH)
      const decodedPlan = JSON.parse(decodedJsonText)

      const expectedJsonText = readFileSync(
        resolve(__dirname, 'fixtures', 'mower-252-3gold.json'),
        'utf-8'
      )
      const expectedPlan = JSON.parse(expectedJsonText)

      expect(decodedPlan).toEqual(expectedPlan)
    })
  })

  describe('Self-generated RGBA roundtrip (light and dark themes)', () => {
    const testJson = JSON.stringify({
      version: '1.0',
      facility: '252',
      operators: ['阿米娅', '凯尔希', '陈'],
      config: { autoRefill: true, count: 42 },
    })

    it('roundtrips light theme RGBA image', () => {
      const width = 3000
      const height = 1250
      const rgba = render16QrToRgba(width, height, testJson, 'light')
      const decoded = decode16QrFromRgba(rgba, width, height)
      expect(JSON.parse(decoded)).toEqual(JSON.parse(testJson))
    })

    it('roundtrips dark theme RGBA image', () => {
      const width = 3000
      const height = 1250
      const rgba = render16QrToRgba(width, height, testJson, 'dark')
      const decoded = decode16QrFromRgba(rgba, width, height)
      expect(JSON.parse(decoded)).toEqual(JSON.parse(testJson))
    })

    it('remains decodable after JPEG lossy compression', () => {
      const width = 3000
      const height = 1250
      const rgba = render16QrToRgba(width, height, testJson, 'light')

      // Compress to JPEG with jpeg-js
      const jpegBuffer = jpeg.encode(
        {
          data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength),
          width,
          height,
        },
        85
      ).data

      // Decompress
      const rawDecompressed = jpeg.decode(jpegBuffer, { useTArray: true })
      const decoded = decode16QrFromRgba(
        rawDecompressed.data,
        rawDecompressed.width,
        rawDecompressed.height
      )
      expect(JSON.parse(decoded)).toEqual(JSON.parse(testJson))
    })
  })

  describe('Canvas export and decode functions', () => {
    const testJson = JSON.stringify({ facility: '252', notes: 'Canvas test' })

    it('exports QR codes to canvas and decodes back via decode16QrFromCanvas', async () => {
      const width = 3000
      const height = 1250
      // Create a virtual canvas backing store
      const buffer = new Uint8ClampedArray(width * height * 4).fill(255)

      const mockCtx = {
        fillStyle: '#000000',
        fillRect: (x: number, y: number, w: number, h: number) => {
          const color = mockCtx.fillStyle === '#000000' ? 0 : 255
          for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4
              buffer[idx] = color
              buffer[idx + 1] = color
              buffer[idx + 2] = color
              buffer[idx + 3] = 255
            }
          }
        },
        getImageData: (x: number, y: number, w: number, h: number) => {
          expect(x).toBe(0)
          expect(y).toBe(0)
          expect(w).toBe(width)
          expect(h).toBe(height)
          return { data: buffer, width, height }
        },
      }

      const mockCanvas = {
        width,
        height,
        getContext: () => mockCtx,
        toBlob: (cb: (b: Blob | null) => void) => {
          cb(new Blob(['mock-jpeg'], { type: 'image/jpeg' }))
        },
      } as unknown as HTMLCanvasElement

      const blob = await exportRosterTo16Qr(mockCanvas, testJson, 'light')
      expect(blob).toBeDefined()
      expect(blob.type).toBe('image/jpeg')

      const decoded = decode16QrFromCanvas(mockCanvas)
      expect(JSON.parse(decoded)).toEqual(JSON.parse(testJson))
    })

    it('throws when canvas dimensions are insufficient for export (< 2735x1210)', async () => {
      const smallCanvas = {
        width: 1000,
        height: 500,
        getContext: () => null,
      } as unknown as HTMLCanvasElement

      await expect(exportRosterTo16Qr(smallCanvas, testJson)).rejects.toThrow(
        /insufficient|minimum 2735x1210/i
      )
    })

    it('throws when canvas dimensions are impossibly small for decode (< 100x100)', () => {
      const tinyCanvas = {
        width: 50,
        height: 50,
        getContext: () => null,
      } as unknown as HTMLCanvasElement

      expect(() => decode16QrFromCanvas(tinyCanvas)).toThrow(
        /too small|minimum 100x100/i
      )
    })
  })

  describe('Error handling', () => {
    const validJson = JSON.stringify({ test: 'ok' })

    it('validates dimensions as positive integers and rejects non-positive/non-integers', () => {
      const buffer = new Uint8ClampedArray(400)
      expect(() => decode16QrFromRgba(buffer, 0, 100)).toThrow(/positive integer/i)
      expect(() => decode16QrFromRgba(buffer, -100, 100)).toThrow(/positive integer/i)
      expect(() => decode16QrFromRgba(buffer, 100.5, 100)).toThrow(/positive integer/i)

      expect(() => render16QrToRgba(0, 1250, validJson)).toThrow(/positive integer/i)
      expect(() => render16QrToRgba(3000.5, 1250, validJson)).toThrow(/positive integer/i)
    })

    it('throws when image dimensions are impossibly small (< 100x100) for decode', () => {
      const badWidth = 50
      const badHeight = 50
      const smallData = new Uint8ClampedArray(badWidth * badHeight * 4)
      expect(() => decode16QrFromRgba(smallData, badWidth, badHeight)).toThrow(
        /too small/i
      )
    })

    it('throws when image dimensions are insufficient (< 2735x1210) for render16QrToRgba', () => {
      expect(() => render16QrToRgba(2000, 1000, validJson)).toThrow(
        /insufficient|minimum 2735x1210/i
      )
    })

    it('throws clear error when RGBA buffer length does not match width * height * 4 in decode16QrFromRgba', () => {
      const badBuffer = new Uint8ClampedArray(10)
      expect(() => decode16QrFromRgba(badBuffer, 200, 200)).toThrow(
        /Invalid rgba buffer length: expected 160000/i
      )
    })

    it('throws clear error when baseRgba buffer length does not match width * height * 4 in render16QrToRgba', () => {
      const badBuffer = new Uint8ClampedArray(10)
      expect(() => render16QrToRgba(3000, 1250, validJson, 'light', badBuffer)).toThrow(
        /Invalid baseRgba buffer length: expected 15000000/i
      )
    })

    it('validates decodeRosterFrom16QrChunks requires exactly 16 string chunks when input is array', () => {
      // 15 items
      const chunks15 = Array.from({ length: 15 }, () => 'abc')
      expect(() => decodeRosterFrom16QrChunks(chunks15)).toThrow(
        /expected exactly 16 chunks, but got 15/i
      )

      // 17 items
      const chunks17 = Array.from({ length: 17 }, () => 'abc')
      expect(() => decodeRosterFrom16QrChunks(chunks17)).toThrow(
        /expected exactly 16 chunks, but got 17/i
      )

      // 16 items but one item is not a string
      const chunksWithNonString = [...Array.from({ length: 15 }, () => 'abc'), 123 as unknown as string]
      expect(() => decodeRosterFrom16QrChunks(chunksWithNonString)).toThrow(
        /chunk at index 15 is not a string/i
      )
    })

    it('throws clear error on invalid UTF-8 bytes despite valid zlib and base45', () => {
      // 0xFF 0xFE 0xFD is invalid UTF-8
      const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0xfd])
      const compressed = deflate(invalidUtf8)
      const base45Payload = encodeBase45(compressed)

      expect(() => decodeRosterFrom16QrChunks(base45Payload)).toThrow(
        /UTF-8 decode failed/i
      )

      const chunks = splitPayloadInto16Chunks(base45Payload)
      expect(() => decodeRosterFrom16QrChunks(chunks)).toThrow(
        /UTF-8 decode failed/i
      )
    })

    it('throws clear error when fewer than 16 QR codes are found', () => {
      // Empty white canvas
      const width = 3000
      const height = 1250
      const blankData = new Uint8ClampedArray(width * height * 4).fill(255)
      expect(() => decode16QrFromRgba(blankData, width, height)).toThrow(
        /expected exactly 16|found 0/i
      )
    })

    it('throws clear error on corrupted payload', () => {
      expect(() => decodeRosterFrom16QrChunks(['INVALID_BASE45~!!'])).toThrow()
      expect(() => decodeRosterFrom16QrChunks('00000000')).toThrow(/corrupted|failed/i)
    })
  })

  describe('Bounded Loop Behavior and Termination', () => {
    it('statically defines finite attempt limits for window and global scan loops', () => {
      expect(MAX_WINDOW_ATTEMPTS).toBeGreaterThan(0)
      expect(MAX_WINDOW_ATTEMPTS).toBeLessThanOrEqual(10)
      expect(MAX_GLOBAL_ATTEMPTS).toBeGreaterThan(0)
      expect(MAX_GLOBAL_ATTEMPTS).toBeLessThanOrEqual(50)
      expect(MIN_DECODE_WIDTH).toBe(100)
      expect(MIN_DECODE_HEIGHT).toBe(100)
    })

    it('terminates scan with bounded attempts on blank or adversarial images', () => {
      const width = 1000
      const height = 1000
      const dummyData = new Uint8ClampedArray(width * height * 4).fill(255)
      // Must terminate and throw clear 16 QR codes error without hanging
      expect(() => decode16QrFromRgba(dummyData, width, height)).toThrow(
        /expected exactly 16|found 0/i
      )
    })

    it('stops scanning immediately when 16 QR codes are found, skipping global full scan', () => {
      const jpgBuffer = readFileSync(resolve(__dirname, 'fixtures', 'mower-252-sample.jpg'))
      const rawImage = jpeg.decode(jpgBuffer, { useTArray: true })
      // Decoding finds all 16 in slot phase and completes rapidly without falling back to full-canvas scan
      const start = Date.now()
      const decoded = decode16QrFromRgba(rawImage.data, rawImage.width, rawImage.height)
      const elapsed = Date.now() - start
      expect(JSON.parse(decoded)).toBeDefined()
      expect(elapsed).toBeLessThan(3000)
    })
  })

  describe('Production code compliance', () => {
    it('production code does not import node built-ins or jpeg-js', () => {
      const filesToCheck = ['base45.ts', 'mowerQrConstants.ts', 'mowerQrCodec.ts']
      const forbiddenTokens = ['node:zlib', 'node:fs', 'jpeg-js', "from 'zlib'", "from 'fs'"]

      for (const file of filesToCheck) {
        const content = readFileSync(resolve(__dirname, file), 'utf-8')
        for (const token of forbiddenTokens) {
          expect(content).not.toContain(token)
        }
      }
    })

    it('production files include Mower MIT derivative copyright comment', () => {
      const filesToCheck = ['base45.ts', 'mowerQrConstants.ts', 'mowerQrCodec.ts']
      for (const file of filesToCheck) {
        const content = readFileSync(resolve(__dirname, file), 'utf-8')
        expect(content).toContain('Copyright (c) 2021 Nano')
        expect(content).toContain('MIT License')
      }
    })
  })
})
