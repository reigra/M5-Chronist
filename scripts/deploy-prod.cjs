const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SERVER = 'ubuntu-server'
const TARGET = '/var/www/html-prod'
const DIST = path.join(ROOT, 'dist')

/**
 * Returns trimmed stdout of a command.
 */
function capture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim()
}

/**
 * Runs a command and pipes its stdio to the parent process.
 */
function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
}

// 1. Check current branch is master
const branch = capture('git rev-parse --abbrev-ref HEAD')
if (branch !== 'master') {
  console.error(`❌ Branch is "${branch}", expected "master". Aborting.`)
  process.exit(1)
}

// 2. Check that no tracked files have uncommitted changes (untracked files are allowed)
const porcelain = capture('git status --porcelain')
const trackedChanges = porcelain
  .split('\n')
  .filter(line => line !== '' && !line.startsWith('??'))
if (trackedChanges.length > 0) {
  console.error('❌ Tracked files have uncommitted changes:')
  trackedChanges.forEach(l => console.error(`  ${l}`))
  process.exit(1)
}

// 3. Bump patch version (bumps package.json only — .npmrc disables commit/tag)
console.log('Bumping patch version…')
run('npm version patch')

// 4. Read new version and commit
const newVersion = capture('node -p "require(\'./package.json\').version"')
console.log(`Committing release v${newVersion}…`)
run(`git add package.json${fs.existsSync(path.join(ROOT, 'package-lock.json')) ? ' package-lock.json' : ''}`)
run(`git commit -m "chore: release v${newVersion}"`)

// 5. Build with production defaults
console.log('Building production version…')
require('./build-prod.cjs')

// 6. Create target directory on server (ignores existing)
console.log('Ensuring target directory…')
run(`ssh ${SERVER} mkdir -p ${TARGET}`)

// 7. Clean old files on server
console.log('Cleaning server…')
run(`ssh ${SERVER} rm -rf ${TARGET}/*`)

// 8. Upload dist/ contents (one by one for Windows compat)
console.log('Uploading…')
for (const item of fs.readdirSync(DIST)) {
  const full = path.join(DIST, item)
  run(`scp -r "${full}" ${SERVER}:${TARGET}/`)
}

// 9. Fix permissions
console.log('Setting permissions…')
run(`ssh ${SERVER} chmod -R a+rX ${TARGET}/`)

console.log('✓ Production build deployed')
