const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const PROJECT = 'magus-ng-dev'
const BRANCH = 'dev'

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

// 1. Build with dev version
console.log('Building dev version…')
require('./build-dev.cjs')

// 2. Deploy the dist/ directory to Cloudflare Pages
console.log(`Deploying to Cloudflare Pages (${PROJECT})…`)
const sha = capture('git rev-parse HEAD')
run(`wrangler pages deploy dist --project-name ${PROJECT} --branch ${BRANCH} --commit-hash ${sha} --commit-dirty`)

console.log(`✓ Dev build deployed to https://${PROJECT}.pages.dev`)
