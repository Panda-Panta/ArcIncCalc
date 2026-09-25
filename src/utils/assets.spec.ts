import { describe, it, expect, afterEach } from 'vitest'
import { resolveAssetUrl } from './assets'

describe('resolveAssetUrl', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    delete (import.meta.env as Record<string, string | undefined>).VITE_ASSET_BASE_URL
  })

  it('returns empty string for empty input', () => {
    expect(resolveAssetUrl('')).toBe('')
  })

  it('preserves absolute URLs and data URIs', () => {
    expect(resolveAssetUrl('https://example.com/pic.png')).toBe('https://example.com/pic.png')
    expect(resolveAssetUrl('http://example.com/pic.png')).toBe('http://example.com/pic.png')
    expect(resolveAssetUrl('data:image/png;base64,123')).toBe('data:image/png;base64,123')
  })

  it('resolves relative or root paths against BASE_URL', () => {
    expect(resolveAssetUrl('avatar/Free.webp')).toBe('/avatar/Free.webp')
    expect(resolveAssetUrl('/avatar/Free.webp')).toBe('/avatar/Free.webp')
  })

  it('uses VITE_ASSET_BASE_URL when specified', () => {
    ;(import.meta.env as Record<string, string | undefined>).VITE_ASSET_BASE_URL = 'https://my-vercel-app.vercel.app'
    expect(resolveAssetUrl('avatar/Free.webp')).toBe('https://my-vercel-app.vercel.app/avatar/Free.webp')
    expect(resolveAssetUrl('/product/gold.png')).toBe('https://my-vercel-app.vercel.app/product/gold.png')
  })
})
