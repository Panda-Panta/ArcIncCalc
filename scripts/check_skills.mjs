import * as fs from 'fs'

const html = fs.readFileSync('C:/Users/Panda-Panta/Downloads/riic_skills_browser.html', 'utf8')
const jsonStart = html.indexOf('const operators = [') + 'const operators = '.length
const jsonEnd = html.indexOf('];\n', jsonStart) + 1
const operators = JSON.parse(html.slice(jsonStart, jsonEnd))

const targetNames = ['结城理', '埃癸斯', '岳羽由加莉', '虎狼丸', '水月', '至简', '巫恋', '龙舌兰', '但书', '温蒂', '清流']

for (const name of targetNames) {
  const op = operators.find(o => o.name === name)
  if (op) {
    console.log(`\n=== 【${op.name}】 (${op.appellation}) ===`)
    for (const s of op.skills) {
      console.log(`  [${s.room}] (${s.phase}) ${s.buffName}: ${s.description}`)
    }
  } else {
    console.log(`\n=== 【${name}】 未找到 ===`)
  }
}
