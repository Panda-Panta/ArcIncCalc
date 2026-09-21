// Reproducible CPU benchmark; outputs stay in artifacts/cpu-optimization.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { cpus, availableParallelism } from 'node:os'
const require = createRequire(import.meta.url)
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }))
const out = resolve('artifacts/cpu-optimization')
mkdirSync(out, { recursive: true })
await build({ stdin: { contents: `export * from './src/optimizer/smartRoster'; export * from './src/workbench/defaults'; export * from './src/domain/operators'; export * from './src/optimizer/candidateSimulationPool';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: `${out}/engine.mjs` })
const engine = await import(pathToFileURL(`${out}/engine.mjs`).href)
const entries = engine.OPERATORS.map(o => ({ operator: o.name, elitePhase: o.rarity < 3 ? 0 : o.rarity === 3 ? 1 : 2, level: o.rarity < 3 ? 30 : o.rarity === 3 ? 55 : o.rarity === 4 ? 70 : o.rarity === 5 ? 80 : 90 }))
const base = engine.createDefaultWorkspace()
const options = { seed: 20260920, branchCount: 4, simulationWarmupHours: 24, simulationSampleHours: 72, enableDeepSearch: false }
const label = process.argv[2] ?? 'baseline'
const parallel = label.startsWith('parallel')
const concurrency = Number(process.argv[3] ?? 4)
if (parallel) await build({ stdin: { contents: `import {parentPort} from 'node:worker_threads'; import {simulateCandidate} from './src/optimizer/candidateSimulation'; parentPort.on('message', job => parentPort.postMessage(simulateCandidate(job)));`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: `${out}/candidate-worker.mjs` })
const start = performance.now(), stages = []
let lastPhase = ''
const progress = p => {
  if (p.phase !== lastPhase || p.phase === 'simulating') {
    const entry = { phase: p.phase, progress: p.phaseProgress, ms: performance.now() - start }
    stages.push(entry); console.log(JSON.stringify(entry)); lastPhase = p.phase
  }
}
const report = parallel
  ? await engine.runSmartRosterParallel(base, entries, options, (jobs, onComplete) => engine.runCandidateBatch(jobs, { concurrency, onComplete, createWorker: () => {
    const worker = new Worker(pathToFileURL(`${out}/candidate-worker.mjs`))
    const adapter = { onmessage: null, onerror: null, onmessageerror: null,
      postMessage: job => worker.postMessage(job), terminate: () => { void worker.terminate() } }
    worker.on('message', data => adapter.onmessage?.({ data }))
    worker.on('error', error => adapter.onerror?.({ message: error.message }))
    worker.on('messageerror', () => adapter.onmessageerror?.())
    return adapter
  } }), progress)
  : engine.runSmartRoster(base, entries, options, progress)
const elapsedMs = performance.now() - start
writeFileSync(`${out}/${label}-report.json`, JSON.stringify(report))
writeFileSync(`${out}/request.json`, JSON.stringify({ base, entries, options }))
const matchesBaseline = label === 'baseline' ? null : isDeepStrictEqual(JSON.parse(readFileSync(`${out}/baseline-report.json`, 'utf8')), JSON.parse(JSON.stringify(report)))
const summary = { cpu: cpus()[0].model, logicalCpus: availableParallelism(), concurrency: parallel ? concurrency : 1, elapsedMs, stages, status: report.status, score: report.score, matchesBaseline }
writeFileSync(`${out}/${label}-timing.json`, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary))
if (matchesBaseline === false) process.exitCode = 1
