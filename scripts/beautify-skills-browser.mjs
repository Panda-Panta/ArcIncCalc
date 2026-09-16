import fs from 'node:fs'
import path from 'node:path'

const htmlPath = 'C:/Users/Panda-Panta/Downloads/riic_skills_browser.html'
const backupPath = 'C:/Users/Panda-Panta/Downloads/riic_skills_browser.html.bak'

// Read backup
const html = fs.readFileSync(backupPath, 'utf8')

// Read project operators for skillIcon mapping
const projectData = JSON.parse(fs.readFileSync('src/data/operators.generated.json', 'utf8'))
const buffToIcon = new Map()
for (const op of projectData.operators) {
  if (op.skillSlots) {
    for (const slot of op.skillSlots) {
      for (const s of slot) {
        if (s.buffId && s.skillIcon) buffToIcon.set(s.buffId, s.skillIcon)
      }
    }
  }
  for (const s of op.skills) {
    if (s.buffId && s.skillIcon) buffToIcon.set(s.buffId, s.skillIcon)
  }
}

// Extract operators dataset from HTML
const match = html.match(/const operators = (\[.*?\]);/s)
if (!match) {
  console.error('Failed to find operators dataset in HTML')
  process.exit(1)
}

const operators = JSON.parse(match[1])

// Inject skillIcon into all skills
let mappedCount = 0
for (const op of operators) {
  for (const s of op.skills) {
    const icon = buffToIcon.get(s.buffId) || ''
    s.skillIcon = icon
    if (icon) mappedCount++
  }
}
console.log(`Injected ${mappedCount} skill icons across ${operators.length} operators.`)

// Build the modernized, beautified HTML
const beautifiedHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PRTS // 明日方舟全量干员后勤技能与羁绊联动数据库</title>
<style>
  :root {
    --bg-base: #070a12;
    --bg-surface: #0c111e;
    --bg-card: rgba(15, 23, 42, 0.75);
    --bg-card-hover: rgba(22, 34, 60, 0.9);
    --bg-skill: rgba(9, 14, 26, 0.95);
    --border-subtle: #1e293b;
    --border-accent: rgba(0, 240, 255, 0.35);
    --accent-cyan: #00f0ff;
    --accent-amber: #f59e0b;
    --accent-gold: #fbbf24;
    --accent-green: #10b981;
    --accent-purple: #a855f7;
    --accent-blue: #38bdf8;
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    --text-dim: #64748b;
    --rarity-6: #f59e0b;
    --rarity-5: #eab308;
    --rarity-4: #c084fc;
    --rarity-3: #38bdf8;
    --rarity-2: #94a3b8;
    --rarity-1: #64748b;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background-color: var(--bg-base);
    background-image: 
      radial-gradient(circle at 15% 15%, rgba(0, 240, 255, 0.04) 0%, transparent 45%),
      radial-gradient(circle at 85% 75%, rgba(245, 158, 11, 0.04) 0%, transparent 45%),
      linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
    background-size: 100% 100%, 100% 100%, 36px 36px, 36px 36px;
    color: var(--text-main);
    padding: 24px 20px 60px;
    min-height: 100vh;
  }
  .container { max-width: 1480px; margin: 0 auto; }
  
  /* Header */
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 20px;
  }
  .brand-wrap { display: flex; flex-direction: column; gap: 6px; }
  .terminal-tag {
    font-size: 11px;
    font-family: "SF Mono", Monaco, Consolas, monospace;
    color: var(--accent-cyan);
    letter-spacing: 2px;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .terminal-tag::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-cyan);
    box-shadow: 0 0 8px var(--accent-cyan);
  }
  h1 {
    font-size: 26px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.5px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .desc-text { font-size: 13px; color: var(--text-muted); }
  .header-meta {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .meta-badge {
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid var(--border-subtle);
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-family: monospace;
    color: var(--text-muted);
  }
  .meta-badge strong { color: var(--accent-cyan); }

  /* Control Panel */
  .control-deck {
    background: rgba(17, 24, 39, 0.85);
    backdrop-filter: blur(16px);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.4);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .search-inputs-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 840px) {
    .search-inputs-grid { grid-template-columns: 1fr; }
  }
  
  .input-box {
    position: relative;
    display: flex;
    align-items: center;
  }
  .input-icon {
    position: absolute;
    left: 14px;
    font-size: 15px;
    pointer-events: none;
    opacity: 0.75;
  }
  .input-field {
    width: 100%;
    padding: 12px 40px 12px 42px;
    background: #090e1a;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    outline: none;
    transition: all 0.2s ease;
  }
  .input-field:focus {
    border-color: var(--accent-cyan);
    box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.18);
    background: #0d1424;
  }
  .input-field::placeholder { color: var(--text-dim); }
  .btn-clear {
    position: absolute;
    right: 12px;
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 16px;
    cursor: pointer;
    padding: 4px;
    display: none;
    border-radius: 4px;
  }
  .btn-clear:hover { color: #fff; background: #1e293b; }

  /* Quick Search Tags */
  .quick-keywords-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--text-dim);
    margin-top: -6px;
  }
  .quick-kw-tag {
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255,255,255,0.06);
    color: var(--text-muted);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .quick-kw-tag:hover {
    background: rgba(0, 240, 255, 0.15);
    border-color: var(--accent-cyan);
    color: var(--accent-cyan);
  }

  /* Filter Section */
  .filter-section-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid rgba(255,255,255,0.05);
    padding-top: 14px;
  }
  .filter-deck-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--text-dim);
    font-family: monospace;
    text-transform: uppercase;
    letter-spacing: 1px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .filter-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .btn-tab {
    background: #090e1a;
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-tab .tab-count {
    font-size: 11px;
    opacity: 0.65;
    font-family: monospace;
  }
  .btn-tab:hover {
    background: #1e293b;
    color: #fff;
    border-color: #334155;
  }
  .btn-tab.active {
    background: rgba(0, 240, 255, 0.12);
    border-color: var(--accent-cyan);
    color: var(--accent-cyan);
    font-weight: 700;
  }

  /* Extra Filters Row (Rarity & Profession) */
  .filter-row-sub {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: center;
    font-size: 12px;
  }
  .filter-group-inline {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .filter-group-label {
    color: var(--text-dim);
    font-size: 11px;
    font-family: monospace;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .btn-chip {
    background: #090e1a;
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-chip:hover {
    background: #1e293b;
    color: #fff;
  }
  .btn-chip.active {
    background: rgba(245, 158, 11, 0.15);
    border-color: var(--accent-amber);
    color: var(--accent-amber);
    font-weight: 700;
  }

  /* Quick Synergy Toggle */
  .btn-synergy-toggle {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: var(--accent-amber);
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-synergy-toggle.active {
    background: var(--accent-amber);
    color: #0b0f19;
    border-color: var(--accent-amber);
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
  }

  /* Result Stats Bar */
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding: 0 4px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .status-highlight {
    color: var(--accent-cyan);
    font-weight: 700;
  }
  .btn-reset-all {
    background: none;
    border: none;
    color: var(--accent-amber);
    cursor: pointer;
    font-size: 13px;
    text-decoration: underline;
    display: none;
  }

  /* Grid & Cards */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
    gap: 18px;
  }
  @media (max-width: 520px) {
    .grid { grid-template-columns: 1fr; }
  }

  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }
  .card:hover {
    transform: translateY(-2px);
    border-color: #3b82f6;
    box-shadow: 0 10px 28px rgba(0,0,0,0.45);
    background: var(--bg-card-hover);
  }
  
  /* Card Header with Operator Avatar */
  .card-top {
    display: flex;
    align-items: center;
    gap: 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    padding-bottom: 12px;
  }
  .op-avatar-wrapper {
    position: relative;
    width: 58px;
    height: 58px;
    flex-shrink: 0;
    border-radius: 10px;
    background: #0d1321;
    overflow: hidden;
    border: 2px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .op-avatar-wrapper.rarity-6 { border-color: var(--rarity-6); box-shadow: 0 0 10px rgba(245, 158, 11, 0.3); }
  .op-avatar-wrapper.rarity-5 { border-color: var(--rarity-5); box-shadow: 0 0 8px rgba(234, 179, 8, 0.25); }
  .op-avatar-wrapper.rarity-4 { border-color: var(--rarity-4); box-shadow: 0 0 6px rgba(192, 132, 252, 0.2); }
  .op-avatar-wrapper.rarity-3 { border-color: var(--rarity-3); }
  .op-avatar-wrapper.rarity-2 { border-color: var(--rarity-2); }
  .op-avatar-wrapper.rarity-1 { border-color: var(--rarity-1); }

  .op-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .op-avatar-fallback {
    display: none;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 800;
    color: #fff;
    background: #1e293b;
  }
  .op-info-main {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .op-name-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .op-name {
    font-size: 19px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.3px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .op-name:hover { color: var(--accent-cyan); }
  .op-en {
    font-size: 12px;
    color: var(--text-dim);
    font-family: monospace;
    font-weight: 600;
  }
  .op-pinyin-pill {
    font-size: 11px;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    padding: 1px 6px;
    border-radius: 4px;
    font-family: monospace;
  }
  .op-badges-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    flex-wrap: wrap;
  }
  .rarity-stars {
    color: #f59e0b;
    font-size: 12px;
    letter-spacing: -1px;
  }
  .prof-pill {
    font-size: 11px;
    background: #1e293b;
    color: #cbd5e1;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 600;
  }
  .prof-先锋 { background: #143525; color: #4ade80; }
  .prof-近卫 { background: #3b1d1d; color: #f87171; }
  .prof-狙击 { background: #192e44; color: #60a5fa; }
  .prof-重装 { background: #2f2514; color: #fbbf24; }
  .prof-医疗 { background: #16363b; color: #2dd4bf; }
  .prof-辅助 { background: #311c38; color: #c084fc; }
  .prof-术师 { background: #31182c; color: #f472b6; }
  .prof-特种 { background: #2a2013; color: #fb923c; }

  .faction-badge {
    font-size: 11px;
    background: rgba(255,255,255,0.06);
    color: var(--text-dim);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .skill-count-tag {
    font-size: 11px;
    background: #1e293b;
    color: var(--text-muted);
    padding: 4px 8px;
    border-radius: 6px;
    font-family: monospace;
    white-space: nowrap;
  }

  /* Skill Items */
  .skills-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .skill-item {
    background: var(--bg-skill);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .skill-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .skill-left-tags {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .skill-icon-frame {
    width: 34px;
    height: 34px;
    background: #080d1a;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }
  .skill-icon-img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    display: block;
  }
  .facility-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.3px;
    display: inline-block;
  }
  .slot-label {
    font-size: 11px;
    color: var(--text-dim);
    font-family: monospace;
  }
  .skill-name-text {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
  .unlock-badge {
    font-size: 11px;
    color: var(--text-dim);
    background: #141c2c;
    border: 1px solid rgba(255,255,255,0.08);
    padding: 2px 7px;
    border-radius: 4px;
    font-family: monospace;
    white-space: nowrap;
  }
  .skill-desc-text {
    font-size: 13px;
    line-height: 1.6;
    color: #cbd5e1;
  }
  .stat-num {
    color: #38bdf8;
    font-weight: 700;
    font-family: monospace;
  }

  /* Synergy Inline Annotations (Tooltips & Popovers) */
  .tag-op-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    vertical-align: baseline;
  }
  .tag-op {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0 2px;
  }
  .tag-op:hover {
    background: #38bdf8;
    color: #080c14;
    border-color: #38bdf8;
  }
  .chip-avatar-inline {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    object-fit: cover;
  }
  .tag-op-tooltip {
    visibility: hidden;
    position: absolute;
    bottom: 125%;
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    white-space: nowrap;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }
  .tag-op-wrap:hover .tag-op-tooltip {
    visibility: visible;
    opacity: 1;
  }

  /* Faction Tag & Popover */
  .tag-faction-wrap {
    position: relative;
    display: inline-block;
    vertical-align: baseline;
  }
  .tag-faction {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.12);
    border: 1px solid rgba(251, 191, 36, 0.35);
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 600;
    cursor: default;
    margin: 0 2px;
  }
  .faction-popover {
    visibility: hidden;
    position: absolute;
    bottom: 125%;
    left: 50%;
    transform: translateX(-50%);
    background: #121929;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 12px;
    z-index: 200;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    opacity: 0;
    transition: opacity 0.15s ease;
    min-width: 240px;
    max-width: 320px;
  }
  .faction-popover::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 6px;
    border-style: solid;
    border-color: #121929 transparent transparent transparent;
  }
  .tag-faction-wrap:hover .faction-popover {
    visibility: visible;
    opacity: 1;
  }
  .popover-header {
    font-size: 12px;
    font-weight: 700;
    color: #fbbf24;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding-bottom: 4px;
  }
  .popover-members {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .popover-op-chip {
    background: #090e1a;
    border: 1px solid #334155;
    padding: 3px 7px;
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .popover-op-chip:hover {
    background: #00f0ff;
    color: #080c14;
    font-weight: 600;
    border-color: #00f0ff;
  }
  .popover-chip-avatar {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    object-fit: cover;
  }

  /* Empty State */
  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 80px 20px;
    background: var(--bg-card);
    border: 1px dashed var(--border-subtle);
    border-radius: 12px;
  }
  .empty-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.6; }
  .empty-title { font-size: 16px; color: var(--text-muted); margin-bottom: 6px; }
  .empty-sub { font-size: 13px; color: var(--text-dim); }

  /* Back to Top */
  .btn-back-top {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid var(--accent-cyan);
    color: var(--accent-cyan);
    font-size: 18px;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0, 240, 255, 0.25);
    backdrop-filter: blur(8px);
    transition: all 0.2s;
    z-index: 999;
  }
  .btn-back-top:hover {
    background: var(--accent-cyan);
    color: #080c14;
    transform: translateY(-3px);
    box-shadow: 0 6px 20px rgba(0, 240, 255, 0.4);
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="brand-wrap">
      <div class="terminal-tag">RHODES ISLAND // PRTS LOGISTICS TERMINAL</div>
      <h1>明日方舟干员后勤技能与羁绊联动数据库</h1>
      <div class="desc-text">支持干员名称独立检索与技能效果独立检索 · 全拼/简拼/英文 · 阵营与协同联动干员一键检索</div>
    </div>
    <div class="header-meta">
      <div class="meta-badge">MOWER DATA: <strong>v2026.09.05</strong></div>
      <div class="meta-badge">DATABASE: <strong>429 干员 / 921 技能</strong></div>
      <div class="meta-badge">ICONS: <strong>552 技能图标 / 432 头像</strong></div>
    </div>
  </header>

  <div class="control-deck">
    <div class="search-inputs-grid">
      <!-- Input 1: Operator Name / Pinyin -->
      <div class="input-box">
        <span class="input-icon">👤</span>
        <input type="text" id="opInput" class="input-field" placeholder="干员检索：中文名 / 全拼(danshu) / 简拼(ds) / 英文(Proviso)..." autocomplete="off">
        <button class="btn-clear" id="opClear" title="清空干员搜索">✕</button>
      </div>
      
      <!-- Input 2: Skill Name / Description -->
      <div class="input-box">
        <span class="input-icon">⚡</span>
        <input type="text" id="skillInput" class="input-field" placeholder="技能检索：技能名称(合同法) / 关键词(赤金、订单、违约、深海猎人、S.E.E.S.)..." autocomplete="off">
        <button class="btn-clear" id="skillClear" title="清空技能搜索">✕</button>
      </div>
    </div>

    <!-- Quick Keywords -->
    <div class="quick-keywords-row">
      <span>常用热搜：</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('赤金')">赤金</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('作战记录')">作战记录</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('订单')">订单效率</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('心情')">心情恢复</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('感知信息')">感知信息</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('人间烟火')">人间烟火</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('深海猎人')">深海猎人</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('莱茵科技')">莱茵科技</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('S.E.E.S.')">S.E.E.S.</span>
      <span class="quick-kw-tag" onclick="quickSearchSkill('作业平台')">作业平台</span>
    </div>

    <!-- Facility Filter Tabs -->
    <div class="filter-section-row">
      <div class="filter-deck-header">
        <span>FACILITY // 按基建设施筛选</span>
        <button class="btn-synergy-toggle" id="synergyToggle">
          <span>🔗</span> 仅看具备联动羁绊的干员 (83人)
        </button>
      </div>
      <div class="filter-tabs" id="roomTabs">
        <button class="btn-tab active" data-room="ALL">全部设施 <span class="tab-count">921</span></button>
        <button class="btn-tab" data-room="MANUFACTURE">制造站 <span class="tab-count">147</span></button>
        <button class="btn-tab" data-room="TRADING">贸易站 <span class="tab-count">120</span></button>
        <button class="btn-tab" data-room="CONTROL">控制中枢 <span class="tab-count">97</span></button>
        <button class="btn-tab" data-room="POWER">发电站 <span class="tab-count">50</span></button>
        <button class="btn-tab" data-room="DORMITORY">宿舍 <span class="tab-count">106</span></button>
        <button class="btn-tab" data-room="MEETING">会客室 <span class="tab-count">93</span></button>
        <button class="btn-tab" data-room="WORKSHOP">加工站 <span class="tab-count">124</span></button>
        <button class="btn-tab" data-room="HIRE">人力办公室 <span class="tab-count">48</span></button>
        <button class="btn-tab" data-room="TRAINING">训练室 <span class="tab-count">136</span></button>
      </div>
    </div>

    <!-- Rarity & Profession Filter Chips -->
    <div class="filter-row-sub">
      <div class="filter-group-inline" id="rarityChips">
        <span class="filter-group-label">星级:</span>
        <button class="btn-chip active" data-rarity="ALL">全部</button>
        <button class="btn-chip" data-rarity="6">6★</button>
        <button class="btn-chip" data-rarity="5">5★</button>
        <button class="btn-chip" data-rarity="4">4★</button>
        <button class="btn-chip" data-rarity="3">3★</button>
        <button class="btn-chip" data-rarity="1-2">1~2★</button>
      </div>

      <div class="filter-group-inline" id="profChips">
        <span class="filter-group-label">职业:</span>
        <button class="btn-chip active" data-prof="ALL">全部</button>
        <button class="btn-chip" data-prof="先锋">先锋</button>
        <button class="btn-chip" data-prof="近卫">近卫</button>
        <button class="btn-chip" data-prof="狙击">狙击</button>
        <button class="btn-chip" data-prof="重装">重装</button>
        <button class="btn-chip" data-prof="医疗">医疗</button>
        <button class="btn-chip" data-prof="辅助">辅助</button>
        <button class="btn-chip" data-prof="术师">术师</button>
        <button class="btn-chip" data-prof="特种">特种</button>
      </div>
    </div>
  </div>

  <div class="status-bar">
    <div id="statusText">正在初始化数据...</div>
    <button class="btn-reset-all" id="resetAllBtn">重置全部筛选条件</button>
  </div>

  <div class="grid" id="operatorsGrid"></div>
</div>

<button class="btn-back-top" id="backTopBtn" title="回到顶部">↑</button>

<script>
const operators = ${JSON.stringify(operators)};

const opInput = document.getElementById("opInput");
const skillInput = document.getElementById("skillInput");
const opClear = document.getElementById("opClear");
const skillClear = document.getElementById("skillClear");
let selectedRoom = "ALL";
let selectedRarity = "ALL";
let selectedProf = "ALL";
let onlySynergies = false;

const roomTabs = document.getElementById("roomTabs");
const rarityChips = document.getElementById("rarityChips");
const profChips = document.getElementById("profChips");
const synergyToggle = document.getElementById("synergyToggle");
const statusText = document.getElementById("statusText");
const resetAllBtn = document.getElementById("resetAllBtn");
const operatorsGrid = document.getElementById("operatorsGrid");
const backTopBtn = document.getElementById("backTopBtn");

function updateClearBtns() {
  opClear.style.display = opInput.value ? "block" : "none";
  skillClear.style.display = skillInput.value ? "block" : "none";
  const hasFilter = opInput.value || skillInput.value || selectedRoom !== "ALL" || selectedRarity !== "ALL" || selectedProf !== "ALL" || onlySynergies;
  resetAllBtn.style.display = hasFilter ? "block" : "none";
}

opInput.addEventListener("input", () => { updateClearBtns(); render(); });
skillInput.addEventListener("input", () => { updateClearBtns(); render(); });

opClear.addEventListener("click", () => {
  opInput.value = "";
  updateClearBtns();
  opInput.focus();
  render();
});

skillClear.addEventListener("click", () => {
  skillInput.value = "";
  updateClearBtns();
  skillInput.focus();
  render();
});

synergyToggle.addEventListener("click", () => {
  onlySynergies = !onlySynergies;
  synergyToggle.classList.toggle("active", onlySynergies);
  updateClearBtns();
  render();
});

resetAllBtn.addEventListener("click", () => {
  opInput.value = "";
  skillInput.value = "";
  selectedRoom = "ALL";
  selectedRarity = "ALL";
  selectedProf = "ALL";
  onlySynergies = false;
  synergyToggle.classList.remove("active");
  document.querySelectorAll(".btn-tab").forEach(t => t.classList.remove("active"));
  document.querySelector('.btn-tab[data-room="ALL"]').classList.add("active");
  document.querySelectorAll("#rarityChips .btn-chip").forEach(t => t.classList.remove("active"));
  document.querySelector('#rarityChips .btn-chip[data-rarity="ALL"]').classList.add("active");
  document.querySelectorAll("#profChips .btn-chip").forEach(t => t.classList.remove("active"));
  document.querySelector('#profChips .btn-chip[data-prof="ALL"]').classList.add("active");
  updateClearBtns();
  render();
});

roomTabs.addEventListener("click", (e) => {
  const tab = e.target.closest(".btn-tab");
  if (!tab) return;
  document.querySelectorAll(".btn-tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  selectedRoom = tab.dataset.room;
  updateClearBtns();
  render();
});

rarityChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".btn-chip");
  if (!chip) return;
  document.querySelectorAll("#rarityChips .btn-chip").forEach(t => t.classList.remove("active"));
  chip.classList.add("active");
  selectedRarity = chip.dataset.rarity;
  updateClearBtns();
  render();
});

profChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".btn-chip");
  if (!chip) return;
  document.querySelectorAll("#profChips .btn-chip").forEach(t => t.classList.remove("active"));
  chip.classList.add("active");
  selectedProf = chip.dataset.prof;
  updateClearBtns();
  render();
});

window.quickSearchSkill = function(kw) {
  skillInput.value = kw;
  updateClearBtns();
  render();
};

window.filterByOp = function(opName) {
  opInput.value = opName;
  updateClearBtns();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// Back to top button
window.addEventListener("scroll", () => {
  if (window.scrollY > 400) {
    backTopBtn.style.display = "flex";
  } else {
    backTopBtn.style.display = "none";
  }
});
backTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function highlightStats(desc) {
  return desc.replace(/([+-]?\\d+(?:\\.\\d+)?%?)/g, '<span class="stat-num">$1</span>');
}

function formatRichDesc(desc, synergy) {
  let html = desc;

  // 1. Replace factions with placeholders
  const factionPlaceholders = [];
  if (synergy && synergy.factions && synergy.factions.length > 0) {
    for (let i = 0; i < synergy.factions.length; i++) {
      const f = synergy.factions[i];
      const ph = "___FACTION_" + i + "___";
      const memberHtml = f.members.map(m => {
        const encoded = encodeURIComponent(m);
        return \`<span class="popover-op-chip" onclick="event.stopPropagation(); filterByOp('\${m}')">
          <img class="popover-chip-avatar" src="resource/ui/public/avatar/\${encoded}.webp" onerror="this.style.display='none'" />
          <span>\${m}</span>
        </span>\`;
      }).join("");
      const fullTag = \`<span class="tag-faction-wrap"><span class="tag-faction">🏛️ \${f.name}</span><span class="faction-popover"><span class="popover-header"><span>🏛️ \${f.name} 成员名单 (\${f.members.length}人)</span></span><span class="popover-members">\${memberHtml}</span></span></span>\`;
      factionPlaceholders.push({ ph, fullTag });
      html = html.split(f.name).join(ph);
    }
  }

  // 2. Highlight Synergy Operators
  if (synergy && synergy.operators && synergy.operators.length > 0) {
    for (const opName of synergy.operators) {
      const encoded = encodeURIComponent(opName);
      const opTag = \`<span class="tag-op-wrap"><span class="tag-op" onclick="event.stopPropagation(); filterByOp('\${opName}')"><img class="chip-avatar-inline" src="resource/ui/public/avatar/\${encoded}.webp" onerror="this.style.display='none'" /><span>@\${opName}</span></span><span class="tag-op-tooltip">🔗 联动干员 · 点击检索</span></span>\`;
      html = html.split(opName).join(opTag);
    }
  }

  // 3. Highlight stats in remaining text
  html = highlightStats(html);

  // 4. Restore faction tags
  for (const item of factionPlaceholders) {
    html = html.split(item.ph).join(item.fullTag);
  }

  return html;
}

function renderStars(rarity) {
  if (!rarity) return "";
  return "★".repeat(rarity);
}

function render() {
  const opQuery = opInput.value.trim().toLowerCase();
  const skillQuery = skillInput.value.trim().toLowerCase();

  const matched = [];

  for (const op of operators) {
    // Synergy filter
    if (onlySynergies) {
      const hasAnySynergy = op.skills.some(s => s.synergy !== null);
      if (!hasAnySynergy) continue;
    }

    // Rarity filter
    if (selectedRarity !== "ALL") {
      if (selectedRarity === "1-2") {
        if (op.rarity > 2) continue;
      } else if (String(op.rarity) !== selectedRarity) {
        continue;
      }
    }

    // Profession filter
    if (selectedProf !== "ALL" && op.profession !== selectedProf) {
      continue;
    }

    // 1. Operator Name match
    if (opQuery) {
      const matchName = op.name.toLowerCase().includes(opQuery);
      const matchPinyin = op.pinyin && op.pinyin.includes(opQuery);
      const matchInitial = op.pinyinInitial && (op.pinyinInitial === opQuery || op.pinyinInitial.startsWith(opQuery));
      const matchEn = op.appellation && op.appellation.toLowerCase().split(/\\s+/).some(w => w.startsWith(opQuery));
      if (!matchName && !matchPinyin && !matchInitial && !matchEn) {
        continue;
      }
    }

    // 2. Filter skills by facility and skillQuery
    const filteredSkills = [];
    for (const s of op.skills) {
      if (selectedRoom !== "ALL" && s.roomCode !== selectedRoom) {
        continue;
      }
      if (onlySynergies && !s.synergy) {
        continue;
      }
      if (skillQuery) {
        const matchBuffName = s.buffName.toLowerCase().includes(skillQuery);
        const matchDesc = s.description.toLowerCase().includes(skillQuery);
        const matchRoom = s.room.includes(skillQuery);
        let matchSynergy = false;
        if (s.synergy) {
          if (s.synergy.operators && s.synergy.operators.some(o => o.toLowerCase().includes(skillQuery))) matchSynergy = true;
          if (s.synergy.factions && s.synergy.factions.some(f => f.name.toLowerCase().includes(skillQuery) || f.members.some(m => m.toLowerCase().includes(skillQuery)))) matchSynergy = true;
        }
        if (!matchBuffName && !matchDesc && !matchRoom && !matchSynergy) {
          continue;
        }
      }
      filteredSkills.push(s);
    }

    if (filteredSkills.length > 0) {
      matched.push({
        op: op,
        skills: filteredSkills
      });
    }
  }

  let totalSkills = 0;
  for (const m of matched) {
    totalSkills += m.skills.length;
  }

  statusText.innerHTML = '已筛选出 <span class="status-highlight">' + matched.length + '</span> 位干员，共包含 <span class="status-highlight">' + totalSkills + '</span> 项后勤技能';

  if (matched.length === 0) {
    operatorsGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">未查询到符合条件的干员或技能</div><div class="empty-sub">请尝试调整干员名称、拼音、效果关键词或清空星级/职业过滤</div></div>';
    return;
  }

  operatorsGrid.innerHTML = matched.map(({ op, skills }) => {
    const encodedName = encodeURIComponent(op.name);
    return \`
      <div class="card">
        <div class="card-top">
          <div class="op-avatar-wrapper rarity-\${op.rarity || 1}">
            <img class="op-avatar-img" src="resource/ui/public/avatar/\${encodedName}.webp" alt="\${op.name}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div class="op-avatar-fallback">\${op.name.slice(0, 2)}</div>
          </div>
          <div class="op-info-main">
            <div class="op-name-row">
              <span class="op-name" onclick="filterByOp('\${op.name}')" title="点击单独查看 \${op.name}">\${op.name}</span>
              \${op.appellation ? \`<span class="op-en">\${op.appellation}</span>\` : ""}
              <span class="op-pinyin-pill">\${op.pinyinInitial} · \${op.pinyin}</span>
            </div>
            <div class="op-badges-row">
              \${op.rarity ? \`<span class="rarity-stars">\${renderStars(op.rarity)}</span>\` : ""}
              \${op.profession ? \`<span class="prof-pill prof-\${op.profession}">\${op.profession}</span>\` : ""}
              \${op.teamId ? \`<span class="faction-badge">#\${op.teamId}</span>\` : ""}
            </div>
          </div>
          <span class="skill-count-tag">\${skills.length} 项技能</span>
        </div>

        <div class="skills-container">
          \${skills.map(s => \`
            <div class="skill-item">
              <div class="skill-item-header">
                <div class="skill-left-tags">
                  \${s.skillIcon ? \`
                    <div class="skill-icon-frame">
                      <img class="skill-icon-img" src="resource/ui/public/building_skill/\${s.skillIcon}.webp" alt="\${s.buffName}" loading="lazy" onerror="this.parentElement.style.display='none';" />
                    </div>
                  \` : ""}
                  <span class="facility-badge" style="background-color: \${s.buffColor}; color: \${s.textColor};">\${s.room}</span>
                  <span class="slot-label">槽位\${s.slot}</span>
                  <span class="skill-name-text">\${s.buffName}</span>
                </div>
                <span class="unlock-badge">\${s.unlockDesc}</span>
              </div>
              <div class="skill-desc-text">\${formatRichDesc(s.description, s.synergy)}</div>
            </div>
          \`).join("")}
        </div>
      </div>
    \`;
  }).join("");
}

updateClearBtns();
render();
</script>
</body>
</html>
`

fs.writeFileSync(htmlPath, beautifiedHtml, 'utf8')
console.log('Successfully generated beautified riic_skills_browser.html at:', htmlPath)
