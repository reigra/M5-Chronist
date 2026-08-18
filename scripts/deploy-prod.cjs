const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const PROJECT = 'magus-ng'
const BRANCH = 'master'

function requireGoogleEnv() {
  const required = ['VITE_GOOGLE_CLIENT_ID', 'VITE_GOOGLE_API_KEY', 'VITE_GOOGLE_APP_ID', 'VITE_GOOGLE_CLIENT_SECRET']
  const missing = new Set(required)

  if (process.env.VITE_GOOGLE_CLIENT_ID) missing.delete('VITE_GOOGLE_CLIENT_ID')
  if (process.env.VITE_GOOGLE_API_KEY) missing.delete('VITE_GOOGLE_API_KEY')
  if (process.env.VITE_GOOGLE_APP_ID) missing.delete('VITE_GOOGLE_APP_ID')
  if (process.env.VITE_GOOGLE_CLIENT_SECRET) missing.delete('VITE_GOOGLE_CLIENT_SECRET')

  if (missing.size > 0) {
    const dotenvPath = path.join(ROOT, '.env')
    if (fs.existsSync(dotenvPath)) {
      const content = fs.readFileSync(dotenvPath, 'utf8')
      for (const key of required) {
        const re = new RegExp(`^${key}=(.+)$`, 'm')
        const match = content.match(re)
        if (match && match[1]) missing.delete(key)
      }
    }
  }

  if (missing.size > 0) {
    console.error(`❌ Google API credentials fehlen: ${[...missing].join(', ')}`)
    console.error('  Kopiere .env.example → .env und trage die Werte ein.')
    process.exit(1)
  }
}

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

// 0. Check Google API credentials
requireGoogleEnv()

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

// 3. Build with production defaults
console.log('Building production version…')
require('./build-prod.cjs')

// 4. Deploy the dist/ directory to Cloudflare Pages
console.log(`Deploying to Cloudflare Pages (${PROJECT})…`)
const sha = capture('git rev-parse HEAD')
run(`wrangler pages deploy dist --project-name ${PROJECT} --branch ${BRANCH} --commit-hash ${sha}`)

console.log(`✓ Production build deployed to https://${PROJECT}.pages.dev`)
