const { execSync } = require('child_process')
const path = require('path')
const pkg = require('../package.json')

const sha = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
process.env.VITE_APP_VERSION = `${pkg.version}-dev.${sha}`
process.env.VITE_PWA_NAME = 'Magus NG - DEV'

try {
  execSync('npm run build', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env },
  })
} catch {
  process.exit(1)
}
