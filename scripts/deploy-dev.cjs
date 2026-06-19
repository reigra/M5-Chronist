const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SERVER = 'ubuntu-server'
const TARGET = '/var/www/html'
const DIST = path.join(__dirname, '..', 'dist')

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
