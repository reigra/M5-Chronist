import evaData from '../tools/rules/eva_kodex.json'
import mogData from '../tools/rules/mogadil.json'

interface Skill {
  id: string
  name: string
  typ?: string
  groups: string[]
  learnCost: number
  advancementCosts: number[]
  baseValue: number
  maxValue: number
  linkedProperty?: string
  notes: string
  costPatternId?: number
}

interface Type {
  id: string
  name: string
  category: string
  groupCosts?: Record<string, number>
}

interface MogadilRoot {
  costColumns: string[]
  costPatterns: number[][]
  skills: Skill[]
}

const eva = evaData as { skills: Skill[]; types: Type[] }
const mog = mogData as MogadilRoot

const mogById = new Map(mog.skills.map(s => [s.id, s]))

const common = eva.skills.filter(s => {
  const m = mogById.get(s.id)
  return m && m.costPatternId !== undefined && s.groups.length > 0
})

console.log(`Skills in EVA: ${eva.skills.length}`)
console.log(`Skills in Mogadil: ${mog.skills.length}`)
console.log(`Common (by id, groups+patternId): ${common.length}`)
console.log('')

let total = 0
let ok = 0
let fail = 0

const failures: string[] = []

for (const type of eva.types) {
  const colIdx = mog.costColumns.indexOf(type.id)
  if (colIdx === -1) {
    console.warn(`WARN: type "${type.id}" not found in mogadil costColumns — skipped`)
    continue
  }

  for (const evaSkill of common) {
    total++
    const mogSkill = mogById.get(evaSkill.id)!

    const costs = evaSkill.groups
      .map(g => type.groupCosts?.[g])
      .filter((c): c is number => c !== undefined)
    const groupFactor = costs.length > 0 ? Math.min(...costs) : 999
    const groupLearn = evaSkill.learnCost * groupFactor * 3

    const patternFactor = mog.costPatterns[mogSkill.costPatternId!][colIdx]
    const patternLearn = evaSkill.learnCost * patternFactor * 3

    if (groupLearn === patternLearn) {
      ok++
    } else {
      fail++
      failures.push(
        `${type.id}  ${evaSkill.id.padEnd(25)} ` +
        `group=${groupLearn}  pattern=${patternLearn}  ` +
        `(factor: ${groupFactor} vs ${patternFactor})`
      )
    }
  }
}

console.log(`Results: ${ok} match, ${fail} mismatch, ${total} total`)

if (failures.length > 0) {
  console.log('')
  console.log('Mismatches:')
  for (const f of failures) {
    console.log(`  ${f}`)
  }
  process.exit(1)
}
