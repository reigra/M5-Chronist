const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SERVER = 'ubuntu-server'
const TARGET = '/var/www/html'
const DIST = path.join(ROOT, 'dist')

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

// 0. Check Google API credentials
requireGoogleEnv()

// 1. Build with dev version
console.log('Building dev version…')
require('./build-dev.cjs')

// 2. Clean old files on server
console.log('Cleaning server…')
execSync(`ssh ${SERVER} rm -rf ${TARGET}/*`, { stdio: 'inherit' })

// 3. Upload dist/ contents (one by one for Windows compat)
console.log('Uploading…')
for (const item of fs.readdirSync(DIST)) {
  const full = path.join(DIST, item)
  execSync(`scp -r "${full}" ${SERVER}:${TARGET}/`, { stdio: 'inherit' })
}

// 4. Fix permissions
console.log('Setting permissions…')
execSync(`ssh ${SERVER} chmod -R a+rX ${TARGET}/`, { stdio: 'inherit' })

console.log('✓ Dev build deployed')
