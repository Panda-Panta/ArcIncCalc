// Run after `vite build` and benchmark-cpu.mjs baseline. Open /cpu-check.html
// through vite preview. Test-only files are written to dist, never shipped source.
import { readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
const assets = readdirSync('dist/assets')
const parent = assets.find(name => name.startsWith('smartRosterWorker-'))
const child = assets.find(name => name.startsWith('candidateSimulationWorker-'))
if (!parent || !child) throw new Error('Build the application first')
const prefix = `const OriginalWorker = self.Worker;
self.Worker = class extends OriginalWorker {
  constructor(...args) { super(...args); self.postMessage({type:'cpu-check',action:'created'}); }
  terminate() { self.postMessage({type:'cpu-check',action:'terminated'}); super.terminate(); }
};\n`
writeFileSync('dist/cpu-parent.js', prefix + readFileSync(`dist/assets/${parent}`, 'utf8'))
// A delayed job lets the real child bundles emit heartbeats while cancellation
// is exercised. The production parent and its terminate path remain unchanged.
writeFileSync('dist/cpu-cancel-child.js', `const checkChannel = new BroadcastChannel('cpu-cancel-check');
const checkId = crypto.randomUUID();
checkChannel.postMessage({id:checkId, kind:'ready'});
setInterval(() => checkChannel.postMessage({id:checkId, kind:'heartbeat'}), 50);
` + readFileSync(`dist/assets/${child}`, 'utf8') + `\nconst originalJob = self.onmessage;
self.onmessage = e => setTimeout(() => originalJob(e), 3000);`)
writeFileSync('dist/cpu-cancel-parent.js', `const NativeWorker = self.Worker;
self.Worker = class extends NativeWorker { constructor(_url, options) { super('/cpu-cancel-child.js', options); } };\n` + readFileSync(`dist/assets/${parent}`, 'utf8'))
copyFileSync('artifacts/cpu-optimization/request.json', 'dist/cpu-request.json')
copyFileSync('artifacts/cpu-optimization/baseline-report.json', 'dist/cpu-expected.json')
writeFileSync('dist/cpu-check.html', `<!doctype html><meta charset="utf-8"><title>CPU 并行运行验证</title>
<h1>正式构建 CPU 并行验证</h1><p>比较完整排班报告，记录实际子线程创建和释放。测试不写入应用存档。</p>
<button id="start">开始验证</button><button id="cancel" disabled>取消计算</button><button id="lifecycle">验证取消后的子线程退出</button><pre id="status">就绪</pre>
<script type="module">
const start = document.querySelector('#start'), cancel = document.querySelector('#cancel'), status = document.querySelector('#status');
let worker, created, terminated, started, request;
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
start.onclick = async () => {
  start.disabled = true; cancel.disabled = false; created = terminated = 0; started = performance.now();
  request = await fetch('/cpu-request.json').then(r => r.json());
  worker = new Worker('/cpu-parent.js', {type:'module'});
  worker.onerror = event => { status.textContent += '\\nERROR ' + event.message; worker.terminate(); start.disabled = false; cancel.disabled = true; };
  worker.onmessage = async ({data}) => {
    if (data.type === 'cpu-check') { if(data.action === 'created') created++; else terminated++; }
    if (data.type === 'progress') status.textContent = data.progress.label + '\\n已创建子线程: ' + created + '，已释放: ' + terminated;
    if (data.type === 'error') { status.textContent = 'FAIL ' + data.error; worker.terminate(); start.disabled = false; cancel.disabled = true; }
    if (data.type === 'complete') {
      const expected = await fetch('/cpu-expected.json').then(r => r.json());
      const equivalent = canonical(data.report) === canonical(expected);
      const result = {equivalent, created, terminated, elapsedMs:performance.now()-started, status:data.report.status, score:data.report.score};
      status.textContent = (equivalent && created > 1 && created === terminated ? 'PASS' : 'FAIL') + '\\n' + JSON.stringify(result, null, 2);
      worker.terminate(); start.disabled = false; cancel.disabled = true;
    }
  };
  worker.postMessage(request);
};
cancel.onclick = () => { worker?.terminate(); status.textContent = '已取消，主线程已终止'; start.disabled = false; cancel.disabled = true; };
document.querySelector('#lifecycle').onclick = async () => {
  start.disabled = true; cancel.disabled = true;
  const channel = new BroadcastChannel('cpu-cancel-check'), ready = new Set();
  let stopped = false, stoppedAt = 0, lateMessages = 0;
  const needed = Math.min(4, Math.max(1, navigator.hardwareConcurrency - 2));
  if (needed < 2) { status.textContent = 'SKIP: 单线程设备'; channel.close(); start.disabled = false; return; }
  status.textContent = '等待真实嵌套线程启动后终止父线程...';
  request = await fetch('/cpu-request.json').then(r => r.json());
  worker = new Worker('/cpu-cancel-parent.js', {type:'module'});
  const timeout = setTimeout(() => { worker.terminate(); channel.close(); status.textContent = 'FAIL: 子线程启动超时'; start.disabled = false; }, 180000);
  channel.onmessage = ({data}) => {
    if (data.kind === 'ready') ready.add(data.id);
    if (stopped && performance.now() - stoppedAt > 100) lateMessages++;
    if (!stopped && ready.size === needed && data.kind === 'heartbeat') {
      stopped = true; stoppedAt = performance.now(); worker.terminate(); clearTimeout(timeout);
      status.textContent = '已终止父线程，检查子线程是否停止...';
      setTimeout(() => { channel.close(); status.textContent = (lateMessages === 0 ? 'PASS' : 'FAIL') + ' cancellation: children=' + ready.size + ', lateHeartbeats=' + lateMessages; start.disabled = false; }, 1500);
    }
  };
  worker.postMessage(request);
};
</script>`)
console.log('Prepared http://127.0.0.1:4175/cpu-check.html')
