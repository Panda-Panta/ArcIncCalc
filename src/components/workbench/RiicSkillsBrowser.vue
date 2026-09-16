<template>
  <div class="riic-skills-page" data-test="riic-skills-browser">
    <div class="browser-container">
      <!-- Page Header -->
      <header class="browser-header">
        <div class="brand-wrap">
          <div class="terminal-tag">PRTS // LOGISTICS DATABASE</div>
          <h2>全量干员后勤技能与联动羁绊数据库</h2>
          <p class="desc-text">
            收录明日方舟全量干员基建技能、联动组合、收益数值与羁绊派系，支持拼音首字母与效果关键词双重即时检索。
          </p>
        </div>
        <div class="header-meta">
          <span class="meta-badge">总干员数 <strong>{{ rawOperators.length }}</strong> 位</span>
          <span class="meta-badge">总基建技能 <strong>{{ totalSkillCount }}</strong> 项</span>
        </div>
      </header>

      <!-- Search & Filter Controls -->
      <div class="control-deck">
        <!-- Dual Search Inputs -->
        <div class="search-inputs-grid">
          <div class="input-box">
            <span class="input-icon">👤</span>
            <input
              v-model="opQuery"
              type="text"
              class="input-field"
              placeholder="搜索干员（支持中文全名、英文代号、全拼或首字母 如: 德克萨斯 / dks / texas）"
              data-test="search-operator-input"
            />
            <button
              v-if="opQuery"
              type="button"
              class="btn-clear"
              title="清空"
              @click="opQuery = ''"
            >
              ×
            </button>
          </div>

          <div class="input-box">
            <span class="input-icon">⚡</span>
            <input
              v-model="skillQuery"
              type="text"
              class="input-field"
              placeholder="搜索技能名称或效果关键词（如: 赤金 / 订单 / 感知信息 / 制造站 / 闪灵）"
              data-test="search-skill-input"
            />
            <button
              v-if="skillQuery"
              type="button"
              class="btn-clear"
              title="清空"
              @click="skillQuery = ''"
            >
              ×
            </button>
          </div>
        </div>

        <!-- Hot Search Tags -->
        <div class="quick-keywords-row">
          <span>常用热搜：</span>
          <span
            v-for="kw in HOT_KEYWORDS"
            :key="kw"
            class="quick-kw-tag"
            @click="skillQuery = kw"
          >
            {{ kw }}
          </span>
        </div>

        <!-- Facility Filter Tabs -->
        <div class="filter-section-row">
          <div class="filter-deck-header">
            <span>FACILITY // 按基建设施筛选</span>
            <button
              type="button"
              class="btn-synergy-toggle"
              :class="{ active: onlySynergies }"
              data-test="synergy-toggle-btn"
              @click="onlySynergies = !onlySynergies"
            >
              <span>🔗</span> 仅看具备联动羁绊的干员 ({{ synergyOperatorCount }}人)
            </button>
          </div>
          <div class="filter-tabs" data-test="facility-tabs">
            <button
              v-for="tab in FACILITY_TABS"
              :key="tab.code"
              type="button"
              class="btn-tab"
              :class="{ active: selectedRoom === tab.code }"
              :data-test="`tab-${tab.code}`"
              @click="selectedRoom = tab.code"
            >
              {{ tab.label }}
              <span class="tab-count">{{ facilityCounts[tab.code] ?? 0 }}</span>
            </button>
          </div>
        </div>

        <!-- Rarity & Profession Filter Chips -->
        <div class="filter-row-sub">
          <div class="filter-group-inline">
            <span class="filter-group-label">星级:</span>
            <button
              v-for="r in RARITY_OPTIONS"
              :key="r.val"
              type="button"
              class="btn-chip"
              :class="{ active: selectedRarity === r.val }"
              @click="selectedRarity = r.val"
            >
              {{ r.label }}
            </button>
          </div>

          <div class="filter-group-inline">
            <span class="filter-group-label">职业:</span>
            <button
              v-for="p in PROFESSIONS"
              :key="p"
              type="button"
              class="btn-chip"
              :class="{ active: selectedProf === p }"
              @click="selectedProf = p"
            >
              {{ p }}
            </button>
          </div>
        </div>
      </div>

      <!-- Result Status Bar -->
      <div class="status-bar">
        <div class="status-text" data-test="result-status-text">
          已筛选出 <span class="status-highlight">{{ filteredList.length }}</span> 位干员，共包含
          <span class="status-highlight">{{ totalFilteredSkills }}</span> 项后勤技能
        </div>
        <button
          v-if="hasActiveFilter"
          type="button"
          class="btn-reset-all"
          data-test="reset-filters-btn"
          @click="resetAllFilters"
        >
          重置全部筛选条件
        </button>
      </div>

      <!-- Operator Cards Grid -->
      <div v-if="filteredList.length > 0" class="cards-grid" data-test="operator-cards-grid">
        <div
          v-for="{ op, skills } in paginatedList"
          :key="op.name"
          class="op-card"
          :data-test="`op-card-${op.name}`"
        >
          <!-- Top Operator Info -->
          <div class="card-top">
            <div class="op-avatar-wrapper" :class="`rarity-${op.rarity || 1}`">
              <img
                :src="getAvatarUrl(op.name)"
                :alt="op.name"
                class="op-avatar-img"
                loading="lazy"
                @error="onAvatarError($event, op.name)"
              />
              <div class="op-avatar-fallback">{{ op.name.slice(0, 2) }}</div>
            </div>
            <div class="op-info-main">
              <div class="op-name-row">
                <span
                  class="op-name"
                  :title="`点击单独查看 ${op.name}`"
                  @click="opQuery = op.name"
                >
                  {{ op.name }}
                </span>
                <span v-if="op.appellation" class="op-en">{{ op.appellation }}</span>
                <span v-if="op.pinyinInitial" class="op-pinyin-pill">
                  {{ op.pinyinInitial }} · {{ op.pinyin }}
                </span>
              </div>
              <div class="op-badges-row">
                <span v-if="op.rarity" class="rarity-stars">{{ '★'.repeat(op.rarity) }}</span>
                <span v-if="op.profession" class="prof-pill" :class="`prof-${op.profession}`">
                  {{ op.profession }}
                </span>
                <span v-if="op.teamId" class="faction-badge">#{{ op.teamId }}</span>
                <span v-else-if="op.nationId" class="faction-badge">#{{ op.nationId }}</span>
              </div>
            </div>
            <span class="skill-count-tag">{{ skills.length }} 项技能</span>
          </div>

          <!-- Skills List -->
          <div class="skills-container">
            <div
              v-for="s in skills"
              :key="`${op.name}-${s.buffId}-${s.level}`"
              class="skill-item"
            >
              <div class="skill-item-header">
                <div class="skill-left-tags">
                  <div v-if="s.skillIcon" class="skill-icon-frame">
                    <img
                      :src="getSkillIcon(s.skillIcon)"
                      :alt="s.buffName"
                      class="skill-icon-img"
                      loading="lazy"
                      @error="onSkillIconError"
                    />
                  </div>
                  <span
                    class="facility-badge"
                    :style="{ backgroundColor: s.buffColor || '#334155', color: s.textColor || '#ffffff' }"
                  >
                    {{ s.room }}
                  </span>
                  <span class="slot-label">槽位{{ s.slot }}</span>
                  <span class="skill-name-text">{{ s.buffName }}</span>
                </div>
                <span class="unlock-badge">{{ s.unlockDesc }}</span>
              </div>

              <!-- Skill Description with Rich Annotations -->
              <div class="skill-desc-text" v-html="formatRichDesc(s.description, s.synergy)"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state" data-test="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">未查询到符合条件的干员或基建技能</div>
        <div class="empty-sub">请尝试调整干员名称、拼音、技能效果关键词或清空星级/职业筛选</div>
      </div>

      <!-- Pagination / Load More if needed -->
      <div v-if="filteredList.length > displayLimit" class="load-more-bar">
        <button type="button" class="btn-load-more" @click="displayLimit += 60">
          加载更多干员 (剩余 {{ filteredList.length - displayLimit }} 位)...
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import rawOperatorsData from '../../data/riic-skills-database.json'

interface SkillSynergyFaction {
  name: string
  members: string[]
}

interface SkillSynergy {
  operators?: string[]
  factions?: SkillSynergyFaction[]
}

interface RiicSkillItem {
  slot: number
  buffId: string
  buffName: string
  room: string
  roomCode: string
  phase: string
  level: number
  unlockDesc: string
  efficiency: number
  buffColor: string
  textColor: string
  description: string
  synergy: SkillSynergy | null
  skillIcon: string
}

interface RiicOperatorItem {
  name: string
  appellation: string
  rarity: number
  profession: string
  pinyin: string
  pinyinInitial: string
  sourceId: string
  nationId: string | null
  groupId: string | null
  teamId: string | null
  skills: RiicSkillItem[]
}

const rawOperators = rawOperatorsData as RiicOperatorItem[]

const HOT_KEYWORDS = [
  '赤金',
  '作战记录',
  '订单效率',
  '心情恢复',
  '感知信息',
  '人间烟火',
  '深海猎人',
  '莱茵科技',
  'S.E.E.S.',
  '作业平台',
]

const FACILITY_TABS = [
  { label: '全部设施', code: 'ALL' },
  { label: '制造站', code: 'MANUFACTURE' },
  { label: '贸易站', code: 'TRADING' },
  { label: '控制中枢', code: 'CONTROL' },
  { label: '发电站', code: 'POWER' },
  { label: '宿舍', code: 'DORMITORY' },
  { label: '会客室', code: 'MEETING' },
  { label: '加工站', code: 'WORKSHOP' },
  { label: '人力办公室', code: 'HIRE' },
  { label: '训练室', code: 'TRAINING' },
]

const RARITY_OPTIONS = [
  { label: '全部', val: 'ALL' },
  { label: '6★', val: '6' },
  { label: '5★', val: '5' },
  { label: '4★', val: '4' },
  { label: '3★', val: '3' },
  { label: '1~2★', val: '1-2' },
]

const PROFESSIONS = ['全部', '先锋', '近卫', '狙击', '重装', '医疗', '辅助', '术师', '特种']

// Reactive Filter States
const opQuery = ref('')
const skillQuery = ref('')
const selectedRoom = ref('ALL')
const selectedRarity = ref('ALL')
const selectedProf = ref('全部')
const onlySynergies = ref(false)
const displayLimit = ref(60)

// Total statistics
const totalSkillCount = computed(() => {
  return rawOperators.reduce((sum, o) => sum + o.skills.length, 0)
})

const synergyOperatorCount = computed(() => {
  return rawOperators.filter(o => o.skills.some(s => Boolean(s.synergy))).length
})

const facilityCounts = computed(() => {
  const counts: Record<string, number> = { ALL: totalSkillCount.value }
  for (const op of rawOperators) {
    for (const s of op.skills) {
      counts[s.roomCode] = (counts[s.roomCode] ?? 0) + 1
    }
  }
  return counts
})

const hasActiveFilter = computed(() => {
  return (
    Boolean(opQuery.value) ||
    Boolean(skillQuery.value) ||
    selectedRoom.value !== 'ALL' ||
    selectedRarity.value !== 'ALL' ||
    selectedProf.value !== '全部' ||
    onlySynergies.value
  )
})

const resetAllFilters = () => {
  opQuery.value = ''
  skillQuery.value = ''
  selectedRoom.value = 'ALL'
  selectedRarity.value = 'ALL'
  selectedProf.value = '全部'
  onlySynergies.value = false
  displayLimit.value = 60
}

// Filtered List
const filteredList = computed(() => {
  const oQ = opQuery.value.trim().toLowerCase()
  const sQ = skillQuery.value.trim().toLowerCase()

  const result: Array<{ op: RiicOperatorItem; skills: RiicSkillItem[] }> = []

  for (const op of rawOperators) {
    // Synergy filter
    if (onlySynergies.value && !op.skills.some(s => Boolean(s.synergy))) {
      continue
    }

    // Rarity filter
    if (selectedRarity.value !== 'ALL') {
      if (selectedRarity.value === '1-2') {
        if (op.rarity > 2) continue
      } else if (String(op.rarity) !== selectedRarity.value) {
        continue
      }
    }

    // Profession filter
    if (selectedProf.value !== '全部' && op.profession !== selectedProf.value) {
      continue
    }

    // Operator Name / Pinyin / Appellation Search
    if (oQ) {
      const matchName = op.name.toLowerCase().includes(oQ)
      const matchPinyin = op.pinyin && op.pinyin.includes(oQ)
      const matchInitial = op.pinyinInitial && (op.pinyinInitial === oQ || op.pinyinInitial.startsWith(oQ))
      const matchEn = op.appellation && op.appellation.toLowerCase().split(/\s+/).some(w => w.startsWith(oQ))
      if (!matchName && !matchPinyin && !matchInitial && !matchEn) {
        continue
      }
    }

    // Skill Filter by Room and SkillQuery
    const matchedSkills: RiicSkillItem[] = []
    for (const s of op.skills) {
      if (selectedRoom.value !== 'ALL' && s.roomCode !== selectedRoom.value) {
        continue
      }
      if (onlySynergies.value && !s.synergy) {
        continue
      }
      if (sQ) {
        const matchBuffName = s.buffName.toLowerCase().includes(sQ)
        const matchDesc = s.description.toLowerCase().includes(sQ)
        const matchRoom = s.room.toLowerCase().includes(sQ)
        let matchSynergy = false
        if (s.synergy) {
          if (s.synergy.operators && s.synergy.operators.some(o => o.toLowerCase().includes(sQ))) {
            matchSynergy = true
          }
          if (
            s.synergy.factions &&
            s.synergy.factions.some(
              f =>
                f.name.toLowerCase().includes(sQ) ||
                f.members.some(m => m.toLowerCase().includes(sQ)),
            )
          ) {
            matchSynergy = true
          }
        }
        if (!matchBuffName && !matchDesc && !matchRoom && !matchSynergy) {
          continue
        }
      }
      matchedSkills.push(s)
    }

    if (matchedSkills.length > 0) {
      result.push({ op, skills: matchedSkills })
    }
  }

  return result
})

const paginatedList = computed(() => {
  return filteredList.value.slice(0, displayLimit.value)
})

const totalFilteredSkills = computed(() => {
  return filteredList.value.reduce((sum, item) => sum + item.skills.length, 0)
})

// URLs
const getAvatarUrl = (name: string) => `/avatar/${encodeURI(name)}.webp`
const getSkillIcon = (iconName: string) => `/building_skill/${encodeURI(iconName)}.webp`

const onAvatarError = (event: Event, _name?: string) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
  const fallback = img.nextElementSibling as HTMLElement
  if (fallback) fallback.style.display = 'flex'
}

const onSkillIconError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (img.parentElement) img.parentElement.style.display = 'none'
}

// Rich Description Formatting
const highlightStats = (desc: string): string => {
  return desc.replace(/([+-]?\d+(?:\.\d+)?%?)/g, '<span class="stat-num">$1</span>')
}

const formatRichDesc = (desc: string, synergy: SkillSynergy | null): string => {
  let html = desc

  // 1. Replace factions
  const factionPlaceholders: Array<{ ph: string; fullTag: string }> = []
  if (synergy?.factions && synergy.factions.length > 0) {
    for (let i = 0; i < synergy.factions.length; i++) {
      const f = synergy.factions[i]!
      const ph = `___FACTION_${i}___`
      const memberHtml = f.members
        .map((m) => {
          return `<span class="popover-op-chip">
            <img class="popover-chip-avatar" src="/avatar/${encodeURI(m)}.webp" onerror="this.style.display='none'" />
            <span>${m}</span>
          </span>`
        })
        .join('')
      const fullTag = `<span class="tag-faction-wrap"><span class="tag-faction">🏛️ ${f.name}</span><span class="faction-popover"><span class="popover-header">🏛️ ${f.name} 成员名单 (${f.members.length}人)</span><span class="popover-members">${memberHtml}</span></span></span>`
      factionPlaceholders.push({ ph, fullTag })
      html = html.split(f.name).join(ph)
    }
  }

  // 2. Highlight Synergy Operators
  if (synergy?.operators && synergy.operators.length > 0) {
    for (const opName of synergy.operators) {
      const opTag = `<span class="tag-op-wrap"><span class="tag-op"><img class="chip-avatar-inline" src="/avatar/${encodeURI(opName)}.webp" onerror="this.style.display='none'" /><span>@${opName}</span></span></span>`
      html = html.split(opName).join(opTag)
    }
  }

  // 3. Highlight stats in remaining text
  html = highlightStats(html)

  // 4. Restore faction tags
  for (const item of factionPlaceholders) {
    html = html.split(item.ph).join(item.fullTag)
  }

  return html
}
</script>

<style scoped>
.riic-skills-page {
  width: 100%;
  min-height: 100vh;
  background-color: #070a12;
  background-image:
    radial-gradient(circle at 15% 15%, rgba(0, 240, 255, 0.04) 0%, transparent 45%),
    radial-gradient(circle at 85% 75%, rgba(245, 158, 11, 0.04) 0%, transparent 45%),
    linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
  background-size: 100% 100%, 100% 100%, 36px 36px, 36px 36px;
  color: #f8fafc;
  padding: 24px 20px 60px;
  box-sizing: border-box;
}

.browser-container {
  max-width: 1480px;
  margin: 0 auto;
}

/* Header */
.browser-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 20px;
}

.brand-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.terminal-tag {
  font-size: 11px;
  font-family: "SF Mono", Monaco, Consolas, monospace;
  color: #00f0ff;
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
  background: #00f0ff;
  box-shadow: 0 0 8px #00f0ff;
}

.browser-header h2 {
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  letter-spacing: -0.5px;
}

.desc-text {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
}

.header-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.meta-badge {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid #1e293b;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
  color: #94a3b8;
}

.meta-badge strong {
  color: #00f0ff;
}

/* Control Panel */
.control-deck {
  background: rgba(17, 24, 39, 0.85);
  backdrop-filter: blur(16px);
  border: 1px solid #1e293b;
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
  border: 1px solid #1e293b;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.input-field:focus {
  border-color: #00f0ff;
  box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.18);
  background: #0d1424;
}

.btn-clear {
  position: absolute;
  right: 12px;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.btn-clear:hover {
  color: #fff;
  background: #1e293b;
}

/* Quick Search Tags */
.quick-keywords-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #64748b;
  margin-top: -6px;
}

.quick-kw-tag {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255,255,255,0.06);
  color: #94a3b8;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-kw-tag:hover {
  background: rgba(0, 240, 255, 0.15);
  border-color: #00f0ff;
  color: #00f0ff;
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
  color: #64748b;
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
  border: 1px solid #1e293b;
  color: #94a3b8;
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
  border-color: #00f0ff;
  color: #00f0ff;
  font-weight: 700;
}

/* Extra Filters Row */
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
  color: #64748b;
  font-size: 11px;
  font-family: monospace;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn-chip {
  background: #090e1a;
  border: 1px solid #1e293b;
  color: #94a3b8;
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
  border-color: #f59e0b;
  color: #f59e0b;
  font-weight: 700;
}

/* Quick Synergy Toggle */
.btn-synergy-toggle {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #f59e0b;
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
  background: #f59e0b;
  color: #0b0f19;
  border-color: #f59e0b;
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
  color: #94a3b8;
}

.status-highlight {
  color: #00f0ff;
  font-weight: 700;
}

.btn-reset-all {
  background: none;
  border: none;
  color: #f59e0b;
  cursor: pointer;
  font-size: 13px;
  text-decoration: underline;
}

/* Cards Grid */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
  gap: 18px;
}

@media (max-width: 520px) {
  .cards-grid { grid-template-columns: 1fr; }
}

.op-card {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.op-card:hover {
  background: rgba(22, 34, 60, 0.9);
  border-color: rgba(0, 240, 255, 0.35);
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(0,0,0,0.5);
}

.card-top {
  display: flex;
  gap: 14px;
  align-items: center;
}

.op-avatar-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background: #0f172a;
  border: 2px solid #334155;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.op-avatar-wrapper.rarity-6 { border-color: #f59e0b; box-shadow: 0 0 10px rgba(245, 158, 11, 0.3); }
.op-avatar-wrapper.rarity-5 { border-color: #eab308; box-shadow: 0 0 8px rgba(234, 179, 8, 0.25); }
.op-avatar-wrapper.rarity-4 { border-color: #c084fc; box-shadow: 0 0 6px rgba(192, 132, 252, 0.2); }
.op-avatar-wrapper.rarity-3 { border-color: #38bdf8; }
.op-avatar-wrapper.rarity-2 { border-color: #94a3b8; }
.op-avatar-wrapper.rarity-1 { border-color: #64748b; }

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

.op-name:hover {
  color: #00f0ff;
}

.op-en {
  font-size: 12px;
  color: #64748b;
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
  flex-wrap: wrap;
}

.rarity-stars {
  font-size: 12px;
  letter-spacing: -1px;
  color: #fbbf24;
}

.prof-pill {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #1e293b;
  color: #cbd5e1;
}

.faction-badge {
  font-size: 11px;
  color: #94a3b8;
  font-family: monospace;
}

.skill-count-tag {
  font-size: 12px;
  color: #64748b;
  background: rgba(15, 23, 42, 0.6);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.05);
  white-space: nowrap;
}

/* Skills Container */
.skills-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skill-item {
  background: rgba(9, 14, 26, 0.95);
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
  color: #64748b;
  font-family: monospace;
}

.skill-name-text {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.unlock-badge {
  font-size: 11px;
  color: #64748b;
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

/* Synergy Highlights and Popovers */
:deep(.stat-num) {
  color: #38bdf8;
  font-weight: 700;
  font-family: monospace;
}

:deep(.tag-faction-wrap) {
  position: relative;
  display: inline-block;
}

:deep(.tag-faction) {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fbbf24;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: help;
}

:deep(.faction-popover) {
  display: none;
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px;
  min-width: 220px;
  max-width: 320px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.7);
  z-index: 50;
  flex-direction: column;
  gap: 6px;
}

:deep(.tag-faction-wrap:hover .faction-popover) {
  display: flex;
}

:deep(.popover-header) {
  font-size: 12px;
  font-weight: 700;
  color: #fbbf24;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 4px;
}

:deep(.popover-members) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

:deep(.popover-op-chip) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #1e293b;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  color: #f1f5f9;
}

:deep(.popover-chip-avatar) {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  object-fit: cover;
}

:deep(.tag-op-wrap) {
  display: inline-block;
  margin: 0 2px;
}

:deep(.tag-op) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 240, 255, 0.1);
  border: 1px solid rgba(0, 240, 255, 0.3);
  color: #00f0ff;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

:deep(.chip-avatar-inline) {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  object-fit: cover;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  background: rgba(17, 24, 39, 0.4);
  border: 1px dashed #334155;
  border-radius: 12px;
  text-align: center;
  gap: 8px;
}

.empty-icon {
  font-size: 36px;
}

.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
}

.empty-sub {
  font-size: 13px;
  color: #64748b;
}

/* Load More */
.load-more-bar {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.btn-load-more {
  background: #1e293b;
  border: 1px solid #334155;
  color: #38bdf8;
  padding: 10px 28px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-load-more:hover {
  background: #0284c7;
  color: #fff;
  border-color: #0284c7;
}
</style>
