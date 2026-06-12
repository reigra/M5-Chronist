import { readFileSync } from 'fs'

interface Metadata {
  id: string
  title: string
  version?: string
  isCore?: boolean
  houseRule?: boolean
}

interface Source {
  file: string
  data: Record<string, any>
  metadata: Metadata
  priority: number
}

// ── Priority ──

function priorityOf(src: Source): number {
  if (src.data.metadata?.priority !== undefined) return src.data.metadata.priority
  if (src.data.metadata?.houseRule) return 0
  if (src.data.metadata?.isCore) return 1
  return 999
}

// ── Provenance ──

interface Attempt {
  value: unknown
  source: string
  priority: number
  /** true = this attempt actually set the field (first time) */
  success: boolean
}

/**
 * provKey: item identifier like "skills.Akrobatik" or "types.Kr" or "skillRules"
 *   → Map of field → Attempt[]
 */
const prov: Map<string, Map<string, Attempt[]>> = new Map()

function record(
  key: string,
  field: string,
  value: unknown,
  source: string,
  priority: number,
  success: boolean,
): void {
  if (!prov.has(key)) prov.set(key, new Map())
  const fields = prov.get(key)!
  if (!fields.has(field)) fields.set(field, [])
  fields.get(field)!.push({ value, source, priority, success })
}

// ── Merge implementations (mirroring RulesStorage) ──

function mergeById(
  target: any[],
  items: any[],
  src: Source,
  category: string,
): void {
  const seen = new Map<string, any>()
  for (const e of target) if (e.id) seen.set(e.id, e)

  for (const item of items) {
    if (!item.id) continue
    const key = `${category}.${item.id}`

    if (!seen.has(item.id)) {
      const copy = { ...item }
      target.push(copy)
      seen.set(item.id, copy)
      for (const f of Object.keys(item)) {
        if (f === 'id') continue
        record(key, f, item[f], src.file, src.priority, true)
      }
    } else {
      const existing = seen.get(item.id)!
      for (const f of Object.keys(item)) {
        if (f === 'id') continue
        if (existing[f] === undefined) {
          existing[f] = item[f]
          record(key, f, item[f], src.file, src.priority, true)
        } else {
          record(key, f, item[f], src.file, src.priority, false)
        }
      }
    }
  }
}

function mergeTypes(
  target: any[],
  sources: Source[],
): void {
  const merged = new Map<string, any>()
  const metaTypes: { type: any; src: Source }[] = []

  for (const src of sources) {
    for (const type of (src.data.types ?? [])) {
      if (type.isMeta) { metaTypes.push({ type, src }); continue }

      const key = `types.${type.id}`

      if (!merged.has(type.id)) {
        const copy: any = {
          ...type,
          groupCosts: type.groupCosts ? { ...type.groupCosts } : undefined,
          spellCosts: type.spellCosts ? { ...type.spellCosts } : undefined,
          fightCosts: type.fightCosts ? { ...type.fightCosts } : undefined,
          propertyBonuses: type.propertyBonuses ? [...type.propertyBonuses] : undefined,
        }
        merged.set(type.id, copy)
        for (const f of ['id', 'name', 'category', 'isMeta']) {
          if (f in type) record(key, f, type[f], src.file, src.priority, true)
        }
        for (const rf of ['groupCosts', 'spellCosts', 'fightCosts'] as const) {
          if (type[rf]) {
            for (const k of Object.keys(type[rf])) {
              record(key, `${rf}.${k}`, type[rf][k], src.file, src.priority, true)
            }
          }
        }
        if (type.propertyBonuses) {
          for (const b of type.propertyBonuses) {
            record(key, `propertyBonuses.${b.id}`, b.value, src.file, src.priority, true)
          }
        }
      } else {
        mergeTypeInto(merged.get(type.id)!, type, src, key)
      }
    }
  }

  // Apply meta-types: add new keys but never overwrite
  for (const { type, src } of metaTypes) {
    for (const t of merged.values()) {
      if (t.category === type.category) {
        mergeTypeInto(t, type, src, `types.${t.id}`, true)
      }
    }
  }

  for (const v of merged.values()) target.push(v)
}

function mergeTypeInto(
  target: any,
  source: any,
  src: Source,
  key: string,
  isMeta = false,
): void {
  for (const f of ['name', 'category'] as const) {
    if (source[f] !== undefined && source[f] !== null) {
      const win = target[f] === undefined || target[f] === source[f]
      if (target[f] === undefined) target[f] = source[f]
      record(key, f, source[f], src.file, src.priority, win)
    }
  }

  for (const rf of ['groupCosts', 'spellCosts', 'fightCosts'] as const) {
    if (!source[rf]) continue
    if (!target[rf]) target[rf] = {}

    for (const [k, v] of Object.entries(source[rf]) as [string, number][]) {
      if (!(k in target[rf])) {
        target[rf][k] = v
        record(key, `${rf}.${k}`, v, src.file, src.priority, true)
      } else {
        record(key, `${rf}.${k}`, v, src.file, src.priority, false)
      }
    }
  }

  if (source.propertyBonuses) {
    if (!target.propertyBonuses) target.propertyBonuses = []
    const known = new Set(target.propertyBonuses.map((b: any) => b.id))
    for (const bonus of source.propertyBonuses) {
      if (!known.has(bonus.id)) {
        target.propertyBonuses.push({ ...bonus })
        record(key, `propertyBonuses.${bonus.id}`, bonus.value, src.file, src.priority, true)
        known.add(bonus.id)
      } else {
        record(key, `propertyBonuses.${bonus.id}`, bonus.value, src.file, src.priority, false)
      }
    }
  }
}

// ── Output ──

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' && v === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

function printConflict(
  field: string,
  success: Attempt,
  failures: Attempt[],
  ignoreEmpty: boolean,
): boolean {
  const sv = JSON.stringify(success.value)
  if (ignoreEmpty && isEmpty(success.value)) return false
  const relevant = failures.filter(f => {
    if (JSON.stringify(f.value) === sv) return false
    if (ignoreEmpty && isEmpty(f.value)) return false
    return true
  })
  if (relevant.length === 0) return false
  const s = `    ${field.padEnd(25)} → ${sv.padEnd(25)} gesetzt von "${success.source}" (Prio ${success.priority})`
  console.log(s)
  for (const f of relevant) {
    const fv = JSON.stringify(f.value)
    console.log(`                                            ✗ "${f.source}" (Prio ${f.priority}) wollte ${fv}`)
  }
  return true
}

function printCategory(
  category: string,
  verbose: boolean,
  ignoreEmpty: boolean,
): void {
  const prefix = category + '.'
  const singleKey = category  // for whole-object categories

  const entries = [...prov.entries()]
    .filter(([k]) => k === singleKey || k.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))

  if (entries.length === 0) return

  let headerShown = false

  for (const [key, fields] of entries) {
    // Determine if this item has any conflicts
    const allAttempts = [...fields.values()]
    const hasConflict = allAttempts.some(aa => aa.some(a => !a.success))

    if (!verbose && !hasConflict) continue

    if (!headerShown) {
      console.log(`\n── ${category} ──`)
      headerShown = true
    }

    const printedFields: Array<{ field: string; winner: Attempt; failures: Attempt[] }> = []
    for (const [field, attempts] of fields) {
      const successIdx = attempts.findIndex(a => a.success)
      if (successIdx === -1) continue

      const winner = attempts[successIdx]
      const failures = attempts.filter((_, i) => i !== successIdx)

      if (!verbose && failures.length === 0) continue

      // Dry-run to check if printConflict would actually print
      const sv = JSON.stringify(winner.value)
      if (!verbose && ignoreEmpty && isEmpty(winner.value)) continue
      const relevant = failures.filter(f => {
        if (JSON.stringify(f.value) === sv) return false
        if (!verbose && ignoreEmpty && isEmpty(f.value)) return false
        return true
      })
      if (!verbose && relevant.length === 0) continue

      printedFields.push({ field, winner, failures })
    }

    if (printedFields.length === 0) continue

    const itemId = key.startsWith(prefix) ? key.slice(prefix.length) : key
    console.log(`  ${itemId}`)
    for (const pf of printedFields) {
      printConflict(pf.field, pf.winner, pf.failures, ignoreEmpty)
    }
  }
}

// ── Main ──

function main(): void {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose')
  const ignoreEmpty = args.includes('--ignore-empty')
  const filePaths = args.filter(a => !a.startsWith('--'))

  if (filePaths.length < 2) {
    console.error('Usage: npx tsx scripts/merge-sim.ts [--verbose] [--ignore-empty] <file1.json> <file2.json> [...]')
    process.exit(1)
  }

  const sources: Source[] = []
  for (const fp of filePaths) {
    const raw = readFileSync(fp, 'utf-8')
    const data = JSON.parse(raw)
    if (!data.metadata?.id || !data.metadata?.title) {
      console.error(`ERROR: "${fp}" missing metadata.id or metadata.title`)
      process.exit(1)
    }
    sources.push({ file: fp, data, metadata: data.metadata, priority: 0 })
  }
  for (const s of sources) s.priority = priorityOf(s)
  sources.sort((a, b) => a.priority - b.priority)

  console.log('Merge-Reihenfolge (Prio aufsteigend = hohe Prio zuerst):')
  for (const s of sources) {
    console.log(`  [Prio ${s.priority}] ${s.metadata.title.padEnd(25)}  ← ${s.file}`)
  }

  // ── Run merge pipeline ──

  const result: Record<string, any[]> = {
    skills: [], types: [], races: [], origins: [], socialStatuses: [],
    languages: [], scripts: [], spells: [], spellDescriptions: [], equipment: [],
  }

  // Types (special merge strategy)
  mergeTypes(result.types, sources)

  // ID-based merge categories
  const idCategories = [
    'skills', 'races', 'origins', 'socialStatuses',
    'languages', 'scripts', 'spells', 'spellDescriptions', 'equipment',
  ] as const
  for (const cat of idCategories) {
    for (const src of sources) {
      const items = src.data[cat] as any[] | undefined
      if (items) mergeById(result[cat], items, src, cat)
    }
  }

  // Whole-object categories (first-wins)
  const wholeCategories = ['skillRules', 'costColumns', 'costPatterns'] as const
  for (const cat of wholeCategories) {
    for (const src of sources) {
      const val = src.data[cat]
      if (val !== undefined) {
        const key = cat
        if (result[cat] === undefined) {
          result[cat] = val
          record(key, '(whole)', val, src.file, src.priority, true)
        } else {
          record(key, '(whole)', val, src.file, src.priority, false)
        }
        break
      }
    }
  }

  // ── Print ──

  console.log('\n── Konflikte (wenn nicht --verbose, nur Felder mit verdeckten Werten) ──')

  for (const cat of [...idCategories, 'types', ...wholeCategories]) {
    printCategory(cat, verbose, ignoreEmpty)
  }

  // Summary
  let totalConflicts = 0
  for (const [, fields] of prov) {
    for (const [, attempts] of fields) {
      if (attempts.some(a => !a.success)) totalConflicts++
    }
  }

  console.log(`\n── Summary ──`)
  console.log(`  ${totalConflicts} field(s) had values blocked by a higher-priority source`)
  if (totalConflicts === 0) console.log('  Alle Quellen sind konfliktfrei — kein Feld wurde verdeckt.')
}
main()
