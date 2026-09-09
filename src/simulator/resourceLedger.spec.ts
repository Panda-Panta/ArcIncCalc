import { describe, expect, it } from 'vitest'
import { collectStorage, createLedger, createStorage, produceStorage, transactLedger } from './resourceLedger'

describe('resource ledger', () => {
  it('refuses an entire transaction when any resource is short', () => {
    const ledger = createLedger({ gold: 3, lmd: 0 })
    const refused = transactLedger(ledger, { gold: -4, lmd: 2000 }, 'order:a')
    expect(refused.applied).toBe(false)
    expect(refused.ledger).toBe(ledger)
    const funded = transactLedger(ledger, { gold: 1 }, 'supply').ledger
    const paid = transactLedger(funded, { gold: -4, lmd: 2000 }, 'order:a')
    expect(paid.applied).toBe(true)
    expect(paid.ledger.balances).toMatchObject({ gold: 0, lmd: 2000 })
    expect(paid.ledger.balances.gold).toBe(paid.ledger.initial.gold! + paid.ledger.inflows.gold! - paid.ledger.outflows.gold!)
    expect(transactLedger(paid.ledger, { gold: -4, lmd: 2000 }, 'order:a').applied).toBe(false)
  })
  it('rejects nonfinite and negative initial resources', () => {
    expect(() => createLedger({ gold: -1 })).toThrow()
    expect(() => createLedger({ lmd: NaN })).toThrow()
    const ledger = createLedger({})
    expect(() => transactLedger(ledger, { lmd: Infinity }, 'bad')).toThrow()
    expect(transactLedger(ledger, { gold: -1, lmd: 1000 }, 'bad').ledger.balances).toEqual({})
  })
  it('pauses production at capacity and transfers only collected inventory', () => {
    const storage = createStorage('gold', 10, 8)
    const produced = produceStorage(storage, 5)
    expect(produced).toMatchObject({ produced: 2, blocked: 3, storage: { amount: 10 } })
    const result = collectStorage(produced.storage, createLedger({ gold: 1 }), 6, 'collect:a')
    expect(result.storage.amount).toBe(4)
    expect(result.ledger.balances.gold).toBe(7)
    expect(storage.amount).toBe(8)
    expect(() => collectStorage(result.storage, result.ledger, 5, 'collect:b')).toThrow()
  })
})
