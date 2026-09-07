// Derived from arknights-mower (https://github.com/ArkMowers/arknights-mower)
// Copyright (c) 2021 Nano
// MIT License

import { describe, it, expect } from 'vitest'
import { encodeBase45, decodeBase45 } from './base45'

describe('RFC 9285 Base45', () => {
  describe('RFC 9285 Test Vectors', () => {
    it('encodes "AB" to "BB8" and decodes back', () => {
      const input = new TextEncoder().encode('AB')
      const encoded = encodeBase45(input)
      expect(encoded).toBe('BB8')
      const decoded = decodeBase45(encoded)
      expect(new TextDecoder().decode(decoded)).toBe('AB')
    })

    it('encodes "Hello!!" to "%69 VD92EX0" and decodes back', () => {
      const input = new TextEncoder().encode('Hello!!')
      const encoded = encodeBase45(input)
      expect(encoded).toBe('%69 VD92EX0')
      const decoded = decodeBase45(encoded)
      expect(new TextDecoder().decode(decoded)).toBe('Hello!!')
    })

    it('encodes "base-45" to "UJCLQE7W581" and decodes back', () => {
      const input = new TextEncoder().encode('base-45')
      const encoded = encodeBase45(input)
      expect(encoded).toBe('UJCLQE7W581')
      const decoded = decodeBase45(encoded)
      expect(new TextDecoder().decode(decoded)).toBe('base-45')
    })

    it('encodes and decodes empty input', () => {
      const input = new Uint8Array(0)
      const encoded = encodeBase45(input)
      expect(encoded).toBe('')
      const decoded = decodeBase45(encoded)
      expect(decoded.length).toBe(0)
    })
  })

  describe('Single-byte handling', () => {
    it('encodes single byte "A" to "K1"', () => {
      const input = new TextEncoder().encode('A')
      const encoded = encodeBase45(input)
      expect(encoded).toBe('K1')
      const decoded = decodeBase45(encoded)
      expect(new TextDecoder().decode(decoded)).toBe('A')
    })

    it('encodes single byte 0 to "00"', () => {
      const input = new Uint8Array([0])
      const encoded = encodeBase45(input)
      expect(encoded).toBe('00')
      expect(decodeBase45(encoded)).toEqual(new Uint8Array([0]))
    })

    it('encodes single byte 255 to "U5"', () => {
      const input = new Uint8Array([255])
      const encoded = encodeBase45(input)
      expect(encoded).toBe('U5')
      expect(decodeBase45(encoded)).toEqual(new Uint8Array([255]))
    })
  })

  describe('Error handling', () => {
    it('throws on invalid characters', () => {
      expect(() => decodeBase45('abc')).toThrow(/Invalid Base45 character/)
      expect(() => decodeBase45('BB~')).toThrow(/Invalid Base45 character/)
      expect(() => decodeBase45('B@')).toThrow(/Invalid Base45 character/)
      expect(() => decodeBase45('B8\n')).toThrow(/Invalid Base45 character/)
    })

    it('throws on illegal remainder length (len % 3 === 1)', () => {
      expect(() => decodeBase45('B')).toThrow(/Invalid Base45 string length/)
      expect(() => decodeBase45('BB8A')).toThrow(/Invalid Base45 string length/)
      expect(() => decodeBase45('BB8BB8A')).toThrow(/Invalid Base45 string length/)
    })

    it('throws on 16-bit overflow (> 65535) in 3-character triple', () => {
      // ':::' -> 44 + 44*45 + 44*2025 = 91124 > 65535
      expect(() => decodeBase45(':::')).toThrow(/overflow/)
      // 65536 = 1 + 21*45 + 32*2025 -> '1LW'
      expect(() => decodeBase45('1LW')).toThrow(/overflow/)
    })

    it('throws on 8-bit overflow (> 255) in 2-character pair', () => {
      // '::' -> 44 + 44*45 = 2024 > 255
      expect(() => decodeBase45('::')).toThrow(/overflow/)
      // 256 = 31 + 5*45 -> 'V5'
      expect(() => decodeBase45('V5')).toThrow(/overflow/)
    })
  })

  describe('Arbitrary binary roundtrip', () => {
    it('roundtrips all 256 possible single-byte values', () => {
      for (let b = 0; b < 256; b++) {
        const input = new Uint8Array([b])
        const encoded = encodeBase45(input)
        const decoded = decodeBase45(encoded)
        expect(decoded).toEqual(input)
      }
    })

    it('roundtrips sequences of various lengths', () => {
      for (let len = 1; len <= 64; len++) {
        const input = new Uint8Array(len)
        for (let j = 0; j < len; j++) {
          input[j] = (j * 37 + 13) & 0xff
        }
        const encoded = encodeBase45(input)
        const decoded = decodeBase45(encoded)
        expect(decoded).toEqual(input)
      }
    })
  })
})
