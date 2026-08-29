import fs from 'node:fs'
import path from 'node:path'

const sourceRoot = process.argv[2]
if (!sourceRoot) {
  console.error('Usage: node scripts/audit-riic-data.mjs <GameData excel directory>')
  process.exit(1)
}

const phaseRank = { PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 }
const building = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'building_data.json'), 'utf8'))
const characters = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'character_table.json'), 'utf8'))
const generated = JSON.parse(fs.readFileSync('src/data/operators.generated.json', 'utf8'))

function bestSkill(slot) {
  return [...(slot.buffData ?? [])].sort((left, right) => {
    const phase = (phaseRank[right.cond?.phase] ?? 0) - (phaseRank[left.cond?.phase] ?? 0)
    return phase || (right.cond?.level ?? 1) - (left.cond?.level ?? 1)
  })[0]
}

const expected = new Map()
for (const [charId, base] of Object.entries(characters)) {
  const slots = building.chars?.[charId]?.buffChar
  if (!base.name || base.profession === 'TOKEN' || charId.startsWith('trap_') || !slots?.length) continue
  expected.set(charId, slots.map(bestSkill).filter(Boolean).map((entry) => entry.buffId))
}

const actual = new Map(generated.operators.map((operator) => [operator.charId, operator]))
const errors = []
for (const [charId, skillIds] of expected) {
  const operator = actual.get(charId)
  if (!operator) {
    errors.push(`Missing operator profile: ${charId}`)
    continue
  }
  const actualIds = operator.skills.map((skill) => skill.buffId)
  if (skillIds.join('|') !== actualIds.join('|')) {
    errors.push(`Skill slot mismatch: ${charId} expected=${skillIds.join(',')} actual=${actualIds.join(',')}`)
  }
  for (const skill of operator.skills) {
    if (!skill.name || !skill.description || !skill.roomType) {
      errors.push(`Incomplete skill: ${charId}/${skill.buffId}`)
    }
  }
}
for (const charId of actual.keys()) {
  if (!expected.has(charId)) errors.push(`Unexpected operator profile: ${charId}`)
}

const roomStats = {}
for (const operator of generated.operators) {
  for (const skill of operator.skills) {
    const stats = (roomStats[skill.roomType] ??= { skills: 0, operators: new Set() })
    stats.skills += 1
    stats.operators.add(operator.charId)
  }
}

console.log(`RIIC profiles: ${actual.size}/${expected.size}`)
console.log(`Highest-stage skills: ${generated.skillCount}`)
for (const [roomType, stats] of Object.entries(roomStats).sort()) {
  console.log(`${roomType.padEnd(12)} operators=${String(stats.operators.size).padStart(3)} skills=${String(stats.skills).padStart(3)}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('Full-facility RIIC data audit passed with zero missing profiles or skill slots')
