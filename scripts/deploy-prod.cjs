const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SERVER = 'ubuntu-server'
const TARGET = '/var/www/html-prod'
const DIST = path.join(__dirname, '..', 'dist')

// 1. Bump patch version (no git tag, .npmrc handles git-tag-version=false)
console.log('Bumping patch version…')
execSync('npm version patch --no-git-tag-version', {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
})

// 2. Build with production defaults
console.log('Building production version…')
require('./build-prod.cjs')

// 3. Create target directory on server (ignores existing)
console.log('Ensuring target directory…')
execSync(`ssh ${SERVER} mkdir -p ${TARGET}`, { stdio: 'inherit' })

// 4. Clean old files on server
console.log('Cleaning server…')
execSync(`ssh ${SERVER} rm -rf ${TARGET}/*`, { stdio: 'inherit' })

// 5. Upload dist/ contents (one by one for Windows compat)
console.log('Uploading…')
for (const item of fs.readdirSync(DIST)) {
  const full = path.join(DIST, item)
  execSync(`scp -r "${full}" ${SERVER}:${TARGET}/`, { stdio: 'inherit' })
}

// 6. Fix permissions
console.log('Setting permissions…')
execSync(`ssh ${SERVER} chmod -R a+rX ${TARGET}/`, { stdio: 'inherit' })

console.log('✓ Production build deployed')
