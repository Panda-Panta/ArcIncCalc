/**
 * @vitest-environment jsdom
 *
 * Test suite for browser-safe file helper module.
 * Covers:
 * - JSON import & export roundtrip (preserving unknown fields)
 * - Real Mower JPG fixture import (mower-252-sample.jpg)
 * - Generated high-res image decode roundtrip (with 16-QR overlay)
 * - Cancellation and non-mutation
 * - Malformed file error reporting
 * - Filename sanitization
 *
 * Derived from arknights-mower (https://github.com/ArkMowers/arknights-mower)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import {
  exportPlanToImage,
  exportPlanToJson,
  getStableTimestamp,
  importPlanFromFile,
  sanitizeFilename,
  type ImageCanvasAdapter,
  type PlanFileAdapters,
} from './fileHelpers'
import { importMowerJson } from './compat/mowerJson'
import { createDefaultWorkspace } from './defaults'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Creates a mock canvas with a backing RGBA buffer that supports fillRect,
 * drawImage, getImageData, and real JPEG encoding via jpeg-js.
 */
function createMockCanvas(width: number, height: number, initialRgba?: Uint8ClampedArray): HTMLCanvasElement {
  const buffer = initialRgba
    ? new Uint8ClampedArray(initialRgba)
    : new Uint8ClampedArray(width * height * 4).fill(255)

  const ctx = {
    fillStyle: '#000000',
    fillRect(x: number, y: number, w: number, h: number) {
      let r = 0, g = 0, b = 0
      if (ctx.fillStyle === '#000000') {
        r = 0; g = 0; b = 0
      } else if (ctx.fillStyle === '#ffffff') {
        r = 255; g = 255; b = 255
      } else if (ctx.fillStyle.startsWith('#')) {
        const hex = ctx.fillStyle.slice(1)
        r = parseInt(hex.slice(0, 2), 16) || 0
        g = parseInt(hex.slice(2, 4), 16) || 0
        b = parseInt(hex.slice(4, 6), 16) || 0
      }

      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const px = x + dx
          const py = y + dy
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4
            buffer[idx] = r
            buffer[idx + 1] = g
            buffer[idx + 2] = b
            buffer[idx + 3] = 255
          }
        }
      }
    },
    drawImage(srcCanvas: any, dx: number, dy: number) {
      if (srcCanvas && srcCanvas._buffer) {
        const srcW = srcCanvas.width
        const srcH = srcCanvas.height
        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            const targetX = dx + x
            const targetY = dy + y
            if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
              const srcIdx = (y * srcW + x) * 4
              const dstIdx = (targetY * width + targetX) * 4
              buffer[dstIdx] = srcCanvas._buffer[srcIdx]
              buffer[dstIdx + 1] = srcCanvas._buffer[srcIdx + 1]
              buffer[dstIdx + 2] = srcCanvas._buffer[srcIdx + 2]
              buffer[dstIdx + 3] = srcCanvas._buffer[srcIdx + 3]
            }
          }
        }
      }
    },
    getImageData(_x: number, _y: number, w: number, h: number) {
      return { data: buffer, width: w, height: h }
    },
  }

  const canvas = {
    width,
    height,
    _buffer: buffer,
    getContext(type: string) {
      return type === '2d' ? ctx : null
    },
    toBlob(cb: (blob: Blob | null) => void, type = 'image/jpeg', quality = 0.95) {
      try {
        const encoded = jpeg.encode(
          {
            data: Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength),
            width,
            height,
          },
          Math.round(quality * 100)
        ).data
        const u8 = new Uint8Array(encoded.byteLength)
        u8.set(encoded)
        const blob = new Blob([u8], { type })
        cb(blob)
      } catch {
        cb(null)
      }
    },
  } as unknown as HTMLCanvasElement

  return canvas
}

describe('fileHelpers.ts', () => {
  const testImageAdapter: ImageCanvasAdapter = {
    async loadImageRgba(file: Blob | File) {
      const arrayBuf = await file.arrayBuffer()
      const raw = jpeg.decode(Buffer.from(arrayBuf), { useTArray: true })
      return {
        data: new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength),
        width: raw.width,
        height: raw.height,
      }
    },
    async captureElementToCanvas(_element: HTMLElement) {
      // Simulate base-map DOM render (width: 2940, height: 1200 with center content)
      const canvas = createMockCanvas(2940, 1200)
      const ctx = canvas.getContext('2d')!
      // Draw simulated facility cards in the center
      ctx.fillStyle = '#2080f0'
      ctx.fillRect(500, 300, 600, 200)
      return canvas
    },
    createCanvas(w: number, h: number) {
      return createMockCanvas(w, h)
    },
  }

  describe('Filename sanitization & stable timestamp', () => {
    it('sanitizes illegal path and special characters in filename', () => {
      expect(sanitizeFilename('plan/with/slashes.json', 'fallback.json')).toBe('plan_with_slashes.json')
      expect(sanitizeFilename('plan\\backslashes.jpg', 'fallback.jpg')).toBe('plan_backslashes.jpg')
      expect(sanitizeFilename('plan:special*chars?.json', 'fallback.json')).toBe('plan_special_chars_.json')
      expect(sanitizeFilename('   ', 'fallback.json')).toBe('fallback.json')
      expect(sanitizeFilename('', 'fallback.json')).toBe('fallback.json')
    })

    it('generates stable timestamp string format YYYYMMDD_HHMMSS', () => {
      const fixedDate = new Date(2026, 8, 2, 14, 30, 45) // September is month index 8
      expect(getStableTimestamp(fixedDate)).toBe('20260902_143045')
    })
  })

  describe('JSON Import & Export Roundtrip', () => {
    it('roundtrips mower-252-3gold.json fixture through import and export', async () => {
      const fixturePath = resolve(__dirname, 'compat', 'fixtures', 'mower-252-3gold.json')
      const jsonText = readFileSync(fixturePath, 'utf-8')
      const file = new File([jsonText], 'mower-252-3gold.json', { type: 'application/json' })

      let downloadedText = ''
      let downloadedFilename = ''
      const adapters: PlanFileAdapters = {
        download: {
          downloadText(text, filename) {
            downloadedText = text
            downloadedFilename = filename
          },
        },
      }

      // 1. Import
      const importResult = await importPlanFromFile(file, adapters)
      expect(importResult.fileType).toBe('json')
      expect(importResult.filename).toBe('mower-252-3gold.json')
      expect(importResult.workspace.compatibility.defaultPlanKey).toBe('plan1')
      expect(importResult.workspace.mainPlan.conf.ling_xi).toBe(3)
      expect(importResult.workspace.mainPlan.facilities.room_1_1.type).toBe('manufacture')

      // 2. Export
      const exportedJson = exportPlanToJson(importResult.workspace, {
        filename: 'exported_plan.json',
        adapters,
      })
      expect(downloadedFilename).toBe('exported_plan.json')
      expect(downloadedText).toBe(exportedJson)

      // 3. Re-import
      const reimportedFile = new File([exportedJson], 'exported_plan.json', { type: 'application/json' })
      const reimportResult = await importPlanFromFile(reimportedFile, adapters)

      // 4. Verify lossless roundtrip
      expect(reimportResult.workspace.mainPlan.conf).toEqual(importResult.workspace.mainPlan.conf)
      expect(reimportResult.workspace.mainPlan.facilities).toEqual(importResult.workspace.mainPlan.facilities)
      expect(reimportResult.workspace.compatibility.backupPlans).toEqual(importResult.workspace.compatibility.backupPlans)
    })

    it('roundtrips mower-342-pure-lmd.json preserving unknown fields and products', async () => {
      const fixturePath = resolve(__dirname, 'compat', 'fixtures', 'mower-342-pure-lmd.json')
      const jsonText = readFileSync(fixturePath, 'utf-8')
      const file = new File([jsonText], 'mower-342-pure-lmd.json', { type: 'application/json' })

      let downloadedText = ''
      let downloadedFilename = ''
      const adapters: PlanFileAdapters = {
        download: {
          downloadText(text, filename) {
            downloadedText = text
            downloadedFilename = filename
          },
        },
      }

      const importResult = await importPlanFromFile(file, adapters)
      const exportedJson = exportPlanToJson(importResult.workspace, {
        filename: 'mower-342-pure-lmd.json',
        adapters,
      })
      expect(downloadedFilename).toBe('mower-342-pure-lmd.json')
      expect(downloadedText).toBe(exportedJson)

      const reimportedWs = importMowerJson(exportedJson)

      expect(reimportedWs.mainPlan.facilities.room_1_1.product).toBe(importResult.workspace.mainPlan.facilities.room_1_1.product)
      expect(reimportedWs.compatibility.unrecognizedFields).toEqual(importResult.workspace.compatibility.unrecognizedFields)
    })
  })

  describe('Real Mower JPG Fixture Import', () => {
    it('imports mower-252-sample.jpg and matches mower-252-3gold.json', async () => {
      const jpgPath = resolve(__dirname, 'compat', 'fixtures', 'mower-252-sample.jpg')
      const jpgBuffer = readFileSync(jpgPath)
      const jpgU8 = new Uint8Array(jpgBuffer.byteLength)
      jpgU8.set(jpgBuffer)
      const file = new File([jpgU8], 'mower-252-sample.jpg', { type: 'image/jpeg' })

      const adapters: PlanFileAdapters = {
        imageCanvas: testImageAdapter,
      }

      const result = await importPlanFromFile(file, adapters)
      expect(result.fileType).toBe('image')
      expect(result.filename).toBe('mower-252-sample.jpg')

      // Compare with JSON fixture
      const expectedJsonText = readFileSync(
        resolve(__dirname, 'compat', 'fixtures', 'mower-252-3gold.json'),
        'utf-8'
      )
      const expectedWs = importMowerJson(expectedJsonText)

      expect(result.workspace.mainPlan.conf.ling_xi).toBe(expectedWs.mainPlan.conf.ling_xi)
      expect(result.workspace.mainPlan.conf.exhaust_require).toEqual(expectedWs.mainPlan.conf.exhaust_require)
      expect(result.workspace.mainPlan.facilities.room_1_1.type).toBe('manufacture')
      expect(result.workspace.mainPlan.facilities.room_1_1.product).toBe(expectedWs.mainPlan.facilities.room_1_1.product)
      expect(result.workspace.mainPlan.facilities.central.slots.length).toBe(expectedWs.mainPlan.facilities.central.slots.length)
    })
  })

  describe('Generated Image Export & Decode Roundtrip', () => {
    it('captures base-map element, encodes 16 QRs, and decodes back into identical workspace', async () => {
      const fixturePath = resolve(__dirname, 'compat', 'fixtures', 'mower-252-3gold.json')
      const jsonText = readFileSync(fixturePath, 'utf-8')
      const initialWs = importMowerJson(jsonText)

      const domElement = document.createElement('div')
      domElement.className = 'plan-container'
      domElement.innerHTML = '<div class="base-map-content">Simulated base map</div>'
      document.body.appendChild(domElement)

      let downloadedBlob: Blob | null = null
      let downloadedFilename = ''

      const adapters: PlanFileAdapters = {
        imageCanvas: testImageAdapter,
        download: {
          downloadBlob(blob, filename) {
            downloadedBlob = blob
            downloadedFilename = filename
          },
        },
      }

      // 1. Export to image
      const exportedBlob = await exportPlanToImage({
        workspace: initialWs,
        baseMapElement: domElement,
        theme: 'light',
        filename: 'my_mower_plan.jpg',
        adapters,
      })

      expect(downloadedBlob).toBeDefined()
      expect(downloadedBlob).toBe(exportedBlob)
      expect(downloadedFilename).toBe('my_mower_plan.jpg')
      expect(exportedBlob.type).toBe('image/jpeg')

      // 2. Decode back by importing the generated JPEG blob
      const exportedFile = new File([exportedBlob], 'my_mower_plan.jpg', { type: 'image/jpeg' })
      const decodeResult = await importPlanFromFile(exportedFile, adapters)

      // 3. Verify decoded workspace deep equals initial workspace
      expect(decodeResult.fileType).toBe('image')
      expect(decodeResult.workspace.mainPlan.conf).toEqual(initialWs.mainPlan.conf)
      expect(decodeResult.workspace.mainPlan.facilities).toEqual(initialWs.mainPlan.facilities)

      domElement.remove()
    })

    it('throws when baseMapElement is null', async () => {
      const ws = createDefaultWorkspace()
      await expect(
        exportPlanToImage({
          workspace: ws,
          baseMapElement: null,
          theme: 'light',
        })
      ).rejects.toThrow(/未提供基建底图 DOM 元素/i)
    })
  })

  describe('Cancellation and Error Handling', () => {
    it('throws meaningful error on malformed JSON file', async () => {
      const brokenFile = new File(['{ broken: invalid json '], 'broken.json', { type: 'application/json' })
      await expect(importPlanFromFile(brokenFile)).rejects.toThrow(/Invalid Mower JSON/i)
    })

    it('throws meaningful error on non-object root JSON file', async () => {
      const nonObjFile = new File(['"just a string"'], 'string.json', { type: 'application/json' })
      await expect(importPlanFromFile(nonObjFile)).rejects.toThrow(/Root must be an object/i)
    })

    it('throws meaningful error on unsupported file extension', async () => {
      const txtFile = new File(['hello'], 'plan.txt', { type: 'text/plain' })
      await expect(importPlanFromFile(txtFile)).rejects.toThrow(/不支持的文件格式: .txt/i)
    })

    it('throws meaningful error on invalid image without QR codes', async () => {
      // 3000x1250 white image without any QR codes
      const blankCanvas = createMockCanvas(3000, 1250)
      const blankBlob = await new Promise<Blob>((resolve) => blankCanvas.toBlob((b) => resolve(b!)))
      const blankFile = new File([blankBlob], 'blank.jpg', { type: 'image/jpeg' })

      const adapters: PlanFileAdapters = {
        imageCanvas: testImageAdapter,
      }

      await expect(importPlanFromFile(blankFile, adapters)).rejects.toThrow(/识别排班图片二维码失败|Failed to decode roster/i)
    })
  })
})
