const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

function capture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim()
}

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
}

// 1. Check current branch is master
const branch = capture('git rev-parse --abbrev-ref HEAD')
if (branch !== 'master') {
  console.error(`❌ Branch is "${branch}", expected "master". Aborting.`)
  process.exit(1)
}

// 2. Check that no tracked files have uncommitted changes
const porcelain = capture('git status --porcelain')
const trackedChanges = porcelain
  .split('\n')
  .filter(line => line !== '' && !line.startsWith('??'))
if (trackedChanges.length > 0) {
  console.error('❌ Tracked files have uncommitted changes:')
  trackedChanges.forEach(l => console.error(`  ${l}`))
  process.exit(1)
}

// 3. Bump patch version
console.log('Bumping patch version…')
run('npm version patch')

// 4. Read new version, update changelog header
const newVersion = capture('node -p "require(\'./package.json\').version"')
const header = `## [v${newVersion}] - ${new Date().toISOString().slice(0, 10)}\n\n`
const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
fs.writeFileSync(path.join(ROOT, 'CHANGELOG.md'), header + changelog)

console.log(`Committing release v${newVersion}…`)
const lockPath = path.join(ROOT, 'package-lock.json')
run(`git add package.json CHANGELOG.md${fs.existsSync(lockPath) ? ' package-lock.json' : ''}`)
run(`git commit -m "chore: release v${newVersion}"`)

console.log('✓ Version bump committed. Run `npm run deploy:prod` to build and deploy.')
