// CPU sampling profile of the unchanged candidate generation algorithm.
import { createRequire } from 'node:module'
import { Session } from 'node:inspector'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }))
const out = resolve('artifacts/cpu-optimization')
mkdirSync(out, { recursive: true })
await build({ stdin: { contents: `export * from './src/optimizer/molecularSynthesis'; export * from './src/workbench/defaults'; export * from './src/domain/operators'; export * from './src/domain/operatorInventory';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: `${out}/generation-engine.mjs` })
const engine = await import(pathToFileURL(`${out}/generation-engine.mjs`).href)
const entries = engine.OPERATORS.map(o => ({ operator: o.name, elitePhase: o.rarity < 3 ? 0 : o.rarity === 3 ? 1 : 2, level: o.rarity < 3 ? 30 : o.rarity === 3 ? 55 : o.rarity === 4 ? 70 : o.rarity === 5 ? 80 : 90 }))
const workspace = engine.createDefaultWorkspace(), inventory = engine.compileOperatorInventory(entries)
const session = new Session(); session.connect()
const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)))
await post('Profiler.enable'); await post('Profiler.start')
const started = performance.now()
const candidates = engine.generateMolecularCandidates(workspace, entries, inventory, { seed: 20260920, branchCount: 4, lockedPositions: new Set(), lockedOperators: new Set(), droneTarget: 'gold' })
const elapsedMs = performance.now() - started
const { profile } = await post('Profiler.stop'); session.disconnect()
writeFileSync(`${out}/generation.cpuprofile`, JSON.stringify(profile))
const nodes = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map(), own = new Map(), inclusive = new Map()
for (const n of profile.nodes) for (const child of n.children ?? []) parent.set(child, n.id)
for (let i = 0; i < profile.samples.length; i++) {
  const leaf = profile.samples[i], dt = profile.timeDeltas[i] / 1000
  own.set(leaf, (own.get(leaf) ?? 0) + dt)
  let id = leaf
  while (id !== undefined) { inclusive.set(id, (inclusive.get(id) ?? 0) + dt); id = parent.get(id) }
}
const rank = map => {
  const groups = new Map()
  for (const [id, ms] of map) {
    const frame = nodes.get(id).callFrame, name = frame.functionName || `(anonymous:${frame.lineNumber + 1})`
    groups.set(name, (groups.get(name) ?? 0) + ms)
  }
  return [...groups].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, ms]) => ({ name, ms: Math.round(ms), percentOfWall: +(100 * ms / elapsedMs).toFixed(1) }))
}
const summary = { elapsedMs, candidates: candidates.length, selfTime: rank(own), inclusiveTime: rank(inclusive), note: 'Sampling attribution, not exact call timing; inclusive costs overlap.' }
writeFileSync(`${out}/generation-profile.json`, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
