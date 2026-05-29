/**
 * bump-version.cjs — erhöht die Patch-Version in package.json automatisch.
 * Wird als prebuild-Skript ausgeführt: jeder `npm run build` inkrementiert die Version.
 *
 * 0.1.4 → 0.1.5
 */

const fs   = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

const [major, minor, patch] = pkg.version.split('.').map(Number)
pkg.version = `${major}.${minor}.${patch + 1}`

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`Version bumped to ${pkg.version}`)
