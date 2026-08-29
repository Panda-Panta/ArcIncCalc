import fs from 'node:fs'
import path from 'node:path'

const sourceRoot = process.argv[2]
if (!sourceRoot) {
  console.error('Usage: node scripts/import-gamedata.mjs <GameData excel directory>')
  process.exit(1)
}

const required = ['building_data.json', 'character_table.json', 'data_version.txt']
for (const file of required) {
  const target = path.join(sourceRoot, file)
  if (!fs.existsSync(target)) {
    console.error(`Missing required GameData file: ${target}`)
    process.exit(1)
  }
}

const building = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'building_data.json'), 'utf8'))
const characters = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'character_table.json'), 'utf8'))
const sourceVersion = fs.readFileSync(path.join(sourceRoot, 'data_version.txt'), 'utf8').trim()
const phaseRank = { PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 }

function cleanDescription(value = '') {
  return value
    .replace(/<\$cc\.[^>]+>/g, '')
    .replace(/<@cc\.[^>]+>/g, '')
    .replace(/<\/?>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function bestSkill(slot) {
  return [...(slot.buffData ?? [])].sort((left, right) => {
    const phase = (phaseRank[right.cond?.phase] ?? 0) - (phaseRank[left.cond?.phase] ?? 0)
    return phase || (right.cond?.level ?? 1) - (left.cond?.level ?? 1)
  })[0]
}

const operators = []
const excludedWithoutBuildingData = []
for (const [charId, base] of Object.entries(characters)) {
  if (!base.name || charId.startsWith('trap_') || base.profession === 'TOKEN') continue
  const buildingChar = building.chars?.[charId]
  if (!buildingChar?.buffChar?.length) {
    excludedWithoutBuildingData.push({ charId, name: base.name })
    continue
  }
  const skills = buildingChar.buffChar
    .map(bestSkill)
    .filter(Boolean)
    .map((entry) => {
      const buff = building.buffs?.[entry.buffId] ?? {}
      return {
        buffId: entry.buffId,
        name: buff.buffName ?? '',
        roomType: buff.roomType ?? '',
        skillIcon: buff.skillIcon ?? '',
        description: cleanDescription(buff.description),
        unlockPhase: phaseRank[entry.cond?.phase] ?? 0,
        unlockLevel: entry.cond?.level ?? 1,
      }
    })

  operators.push({
    charId,
    name: base.name,
    appellation: base.appellation ?? '',
    rarity: Number(String(base.rarity ?? 'TIER_1').replace('TIER_', '')),
    profession: base.profession ?? '',
    nationId: base.nationId ?? null,
    groupId: base.groupId ?? null,
    teamId: base.teamId ?? null,
    skills,
  })
}

operators.sort((left, right) => right.rarity - left.rarity || left.name.localeCompare(right.name, 'zh-CN'))

if (operators.some((operator) => operator.skills.length === 0)) {
  throw new Error('Import invariant failed: a selectable operator has no RIIC skills')
}

const payload = {
  schemaVersion: 1,
  sourceVersion,
  operatorCount: operators.length,
  skillCount: operators.reduce((sum, operator) => sum + operator.skills.length, 0),
  operators,
}

const output = path.resolve('src/data/operators.generated.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(payload)}\n`, 'utf8')
console.log(`Generated ${payload.operatorCount} RIIC operator profiles with ${payload.skillCount} skills at ${output}`)
console.log(`Excluded ${excludedWithoutBuildingData.length} characters without building_data records`)
