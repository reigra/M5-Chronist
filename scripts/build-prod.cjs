const { execSync } = require('child_process')
const path = require('path')

try {
  execSync('npm run build', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  })
} catch {
  process.exit(1)
}
