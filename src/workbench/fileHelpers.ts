/**
 * Browser-safe file helper module for Mower Plan Toolbar.
 *
 * Provides lossless Mower JSON and 16-QR JPG file operations:
 * - JSON import & export (UTF-8 application/json, preserving unknown fields)
 * - JPG import (16-QR decode via RGBA canvas)
 * - JPG export (high-resolution DOM capture + 16-QR overlay)
 * - Safe filename sanitization
 * - Injected test adapters for deterministic headless testing
 *
 * Derived from arknights-mower (https://github.com/ArkMowers/arknights-mower)
 * Original work Copyright (c) 2021 Nano
 * Licensed under the MIT License
 */

import type { InjectionKey } from 'vue'
import { toCanvas } from 'html-to-image'
import { exportMowerJson, importMowerJson } from './compat/mowerJson'
import { decode16QrFromRgba, exportRosterTo16Qr } from './compat/mowerQrCodec'
import {
  REFERENCE_IMAGE_HEIGHT,
  REFERENCE_IMAGE_WIDTH,
  type QrTheme,
} from './compat/mowerQrConstants'
import type { RosterWorkspace } from './model'

export interface FileDownloadAdapter {
  downloadBlob(blob: Blob, filename: string): void
  downloadText(text: string, filename: string, mimeType?: string): void
}

export interface FileDialogAdapter {
  pickFile(accept: string): Promise<File | null>
  confirm(message: string): Promise<boolean> | boolean
}

export interface ImageCanvasAdapter {
  loadImageRgba(file: Blob | File): Promise<{ data: Uint8ClampedArray; width: number; height: number }>
  captureElementToCanvas(
    element: HTMLElement,
    options?: { backgroundColor?: string; pixelRatio?: number }
  ): Promise<HTMLCanvasElement>
  createCanvas?(width: number, height: number): HTMLCanvasElement
}

export interface PlanFileAdapters {
  download?: Partial<FileDownloadAdapter>
  dialog?: Partial<FileDialogAdapter>
  imageCanvas?: Partial<ImageCanvasAdapter>
}

export interface ResolvedPlanFileAdapters {
  download: FileDownloadAdapter
  dialog: FileDialogAdapter
  imageCanvas: ImageCanvasAdapter
}

export interface ImportPlanResult {
  workspace: RosterWorkspace
  filename: string
  fileType: 'json' | 'image'
}

export const PLAN_FILE_ADAPTERS_KEY: InjectionKey<PlanFileAdapters> = Symbol('PLAN_FILE_ADAPTERS')

/**
 * Sanitizes a filename by replacing illegal path/character symbols with underscores.
 */
export function sanitizeFilename(name: string, fallback: string): string {
  if (!name || typeof name !== 'string') return fallback
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, '_').trim()
  return cleaned.length > 0 ? cleaned : fallback
}

/**
 * Generates a stable timestamp string format YYYYMMDD_HHMMSS for file naming.
 */
export function getStableTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  const s = pad(date.getSeconds())
  return `${y}${m}${d}_${h}${min}${s}`
}

export function getDefaultDownloadAdapter(): FileDownloadAdapter {
  return {
    downloadBlob(blob: Blob, filename: string): void {
      if (
        typeof window === 'undefined' ||
        typeof document === 'undefined' ||
        typeof URL === 'undefined' ||
        typeof URL.createObjectURL !== 'function'
      ) {
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // ignore revocation errors
        }
      }, 1000)
    },
    downloadText(text: string, filename: string, mimeType = 'application/json'): void {
      const blob = new Blob([text], { type: `${mimeType};charset=utf-8` })
      this.downloadBlob(blob, filename)
    },
  }
}

export function getDefaultDialogAdapter(): FileDialogAdapter {
  return {
    pickFile(accept: string): Promise<File | null> {
      return new Promise<File | null>((resolve) => {
        if (typeof document === 'undefined') {
          resolve(null)
          return
        }
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = accept
        input.style.display = 'none'

        let resolved = false
        const done = (file: File | null) => {
          if (resolved) return
          resolved = true
          input.remove()
          resolve(file)
        }

        input.onchange = () => {
          const file = input.files?.[0] ?? null
          done(file)
        }
        input.oncancel = () => {
          done(null)
        }

        document.body.appendChild(input)
        input.click()
      })
    },
    confirm(message: string): boolean {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return window.confirm(message)
      }
      return true
    },
  }
}

export function getDefaultImageCanvasAdapter(): ImageCanvasAdapter {
  return {
    loadImageRgba(file: Blob | File): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
      return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
          reject(new Error('Browser environment or injected image adapter required'))
          return
        }
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            const width = img.naturalWidth || img.width
            const height = img.naturalHeight || img.height
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              URL.revokeObjectURL(url)
              reject(new Error('Failed to obtain 2d rendering context for image loading'))
              return
            }
            ctx.drawImage(img, 0, 0)
            const imgData = ctx.getImageData(0, 0, width, height)
            URL.revokeObjectURL(url)
            resolve({ data: imgData.data, width, height })
          } catch (err) {
            URL.revokeObjectURL(url)
            reject(err)
          }
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('Failed to load image file: decoding error'))
        }
        img.src = url
      })
    },
    captureElementToCanvas(
      element: HTMLElement,
      options?: { backgroundColor?: string; pixelRatio?: number }
    ): Promise<HTMLCanvasElement> {
      return toCanvas(element, {
        pixelRatio: options?.pixelRatio ?? 3,
        backgroundColor: options?.backgroundColor,
        style: { margin: '0', padding: '8px 0' },
      })
    },
  }
}

export function resolvePlanFileAdapters(overrides?: PlanFileAdapters): ResolvedPlanFileAdapters {
  const defaultDownload = getDefaultDownloadAdapter()
  const defaultDialog = getDefaultDialogAdapter()
  const defaultImageCanvas = getDefaultImageCanvasAdapter()

  return {
    download: {
      downloadBlob: overrides?.download?.downloadBlob ?? defaultDownload.downloadBlob.bind(defaultDownload),
      downloadText: overrides?.download?.downloadText ?? defaultDownload.downloadText.bind(defaultDownload),
    },
    dialog: {
      pickFile: overrides?.dialog?.pickFile ?? defaultDialog.pickFile.bind(defaultDialog),
      confirm: overrides?.dialog?.confirm ?? defaultDialog.confirm.bind(defaultDialog),
    },
    imageCanvas: {
      loadImageRgba: overrides?.imageCanvas?.loadImageRgba ?? defaultImageCanvas.loadImageRgba.bind(defaultImageCanvas),
      captureElementToCanvas: overrides?.imageCanvas?.captureElementToCanvas ?? defaultImageCanvas.captureElementToCanvas.bind(defaultImageCanvas),
      createCanvas: overrides?.imageCanvas?.createCanvas,
    },
  }
}

/**
 * Imports a Mower roster from a File (accepts .json, .jpg, .jpeg).
 * Atomically parses and returns a RosterWorkspace without mutating any external state.
 */
export async function importPlanFromFile(
  file: File,
  adapters?: PlanFileAdapters
): Promise<ImportPlanResult> {
  const resolved = resolvePlanFileAdapters(adapters)
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'json' || file.type === 'application/json') {
    let text: string
    try {
      text = await file.text()
    } catch (err: unknown) {
      throw new Error(`读取 JSON 文件失败: ${(err as Error).message}`)
    }
    const workspace = importMowerJson(text)
    return { workspace, filename: file.name, fileType: 'json' }
  }

  if (ext === 'jpg' || ext === 'jpeg' || file.type === 'image/jpeg') {
    let rgbaInfo: { data: Uint8ClampedArray; width: number; height: number }
    try {
      rgbaInfo = await resolved.imageCanvas.loadImageRgba(file)
    } catch (err: unknown) {
      throw new Error(`加载排班图片失败: ${(err as Error).message}`)
    }

    let decodedJsonText: string
    try {
      decodedJsonText = decode16QrFromRgba(rgbaInfo.data, rgbaInfo.width, rgbaInfo.height)
    } catch (err: unknown) {
      throw new Error(`识别排班图片二维码失败: ${(err as Error).message}`)
    }

    let workspace: RosterWorkspace
    try {
      workspace = importMowerJson(decodedJsonText)
    } catch (err: unknown) {
      throw new Error(`解析二维码排班数据失败: ${(err as Error).message}`)
    }

    return { workspace, filename: file.name, fileType: 'image' }
  }

  throw new Error(`不支持的文件格式: .${ext}。仅支持导入 .json、.jpg、.jpeg 文件`)
}

/**
 * Exports workspace to UTF-8 application/json and triggers download.
 */
export function exportPlanToJson(
  workspace: RosterWorkspace,
  options?: { filename?: string; adapters?: PlanFileAdapters }
): string {
  const resolved = resolvePlanFileAdapters(options?.adapters)
  const jsonText = exportMowerJson(workspace)
  const filename = sanitizeFilename(options?.filename ?? 'mower_plan.json', 'mower_plan.json')
  resolved.download.downloadText(jsonText, filename, 'application/json')
  return jsonText
}

/**
 * Captures base-map DOM element at Mower-compatible fixed high resolution,
 * overlays 16 QR codes, and downloads JPEG blob.
 */
export async function exportPlanToImage(params: {
  workspace: RosterWorkspace
  baseMapElement: HTMLElement | null
  theme?: QrTheme
  filename?: string
  adapters?: PlanFileAdapters
}): Promise<Blob> {
  if (!params.baseMapElement) {
    throw new Error('未提供基建底图 DOM 元素，无法导出排班图片')
  }

  const resolved = resolvePlanFileAdapters(params.adapters)
  const theme = params.theme ?? 'light'
  const bgColor = theme === 'dark' ? '#000000' : '#ffffff'

  // 1. Capture base map DOM element to canvas at high resolution (pixelRatio: 3)
  let capturedCanvas: HTMLCanvasElement
  try {
    capturedCanvas = await resolved.imageCanvas.captureElementToCanvas(params.baseMapElement, {
      backgroundColor: bgColor,
      pixelRatio: 3,
    })
  } catch (err: unknown) {
    throw new Error(`截图生成底图失败: ${(err as Error).message}`)
  }

  // 2. Prepare Mower-compatible target canvas meeting or exceeding minimum dimensions
  const targetWidth = Math.max(capturedCanvas.width, REFERENCE_IMAGE_WIDTH)
  const targetHeight = Math.max(capturedCanvas.height, REFERENCE_IMAGE_HEIGHT)

  const targetCanvas = resolved.imageCanvas.createCanvas
    ? resolved.imageCanvas.createCanvas(targetWidth, targetHeight)
    : document.createElement('canvas')

  targetCanvas.width = targetWidth
  targetCanvas.height = targetHeight
  const ctx = targetCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建目标画布 2D 上下文')
  }

  // Fill background
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, targetWidth, targetHeight)

  // Center captured base-map DOM onto target canvas
  const offsetX = Math.max(0, Math.floor((targetWidth - capturedCanvas.width) / 2))
  const offsetY = Math.max(0, Math.floor((targetHeight - capturedCanvas.height) / 2))
  ctx.drawImage(capturedCanvas, offsetX, offsetY)

  // 3. Serialize workspace to Mower JSON
  const jsonText = exportMowerJson(params.workspace)

  // 4. Overlay 16 QR codes onto the canvas and export to JPEG blob
  const blob = await exportRosterTo16Qr(targetCanvas, jsonText, theme)

  // 5. Download blob
  const filename = sanitizeFilename(params.filename ?? 'mower_plan.jpg', 'mower_plan.jpg')
  resolved.download.downloadBlob(blob, filename)

  return blob
}
