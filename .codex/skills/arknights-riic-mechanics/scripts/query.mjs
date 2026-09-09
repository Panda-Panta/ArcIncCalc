import fs from 'node:fs'
const catalog = JSON.parse(fs.readFileSync(new URL('../references/catalog.json', import.meta.url), 'utf8'))
const name = process.argv[2]
if (!name) {
  console.log(JSON.stringify(catalog.manifest, null, 2))
} else {
  const operator = catalog.operators.find(operator => operator.name === name)
  if (!operator) {
    console.error(`未识别正式代号：${name}；请使用国服游戏内原名。`)
    process.exitCode = 1
  } else {
    console.log(JSON.stringify(operator, null, 2))
  }
}
