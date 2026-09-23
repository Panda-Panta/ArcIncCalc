import { it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { importMowerJson } from '../workbench/compat/mowerJson'
import { runScheduleSimulationBridge } from '../workbench/scheduleSimulationBridge'

it('keeps ideal-runner roster decisions independent of the order random seed', async ({ annotate }) => {
  await annotate('Checking equal roster decisions across independent order streams')
  const root = new URL('../../validation/mower-backup-2026-09-22/', import.meta.url)
  const workspace = importMowerJson(readFileSync(new URL('roster.json', root), 'utf8'))
  const reports = [42, 2026].map(seed => runScheduleSimulationBridge(workspace,
    { warmupHours: 0, sampleHours: Number(process.env.MOWER_DETERMINISM_HOURS ?? 168), production: { runOrderMode: 'ideal', outputMode: 'potential', droneTarget: 'exp', seed } },
    { restingThreshold: .65, fiammettaFool: false }).report!)
  expect(reports.every(r => r.success)).toBe(true)
  const events = reports.map(r => r.events.map(e => ({ ...e, time: Number(e.time.toFixed(6)), moraleBefore: undefined, moraleAfter: undefined })))
  writeFileSync(new URL('roster-seed-events.json', root), JSON.stringify(events, null, 2))
  const mismatch = Array.from({ length: Math.max(events[0]!.length, events[1]!.length) }, (_, i) => i)
    .find(i => JSON.stringify(events[0]![i]) !== JSON.stringify(events[1]![i]))
  expect(mismatch, JSON.stringify({ mismatch, pair: events.map(es => es.slice(Math.max(0,(mismatch ?? 0)-1), (mismatch ?? 0)+2)) })).toBeUndefined()
}, 360000)
