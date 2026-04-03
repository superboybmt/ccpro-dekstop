import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'

const ROOT = resolve(process.cwd())
const DEFAULT_TARGETS = ['src', 'scripts', 'AGENTS.md', '.codex/skills']
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.md'])
const SUSPICIOUS_TEXT_PATTERN = /\u00C3.|\u00C2.|\u00C4.|\u00E2\u20AC|\uFFFD/u

const collectFiles = (targetPath) => {
  const fullPath = resolve(ROOT, targetPath)
  const stats = statSync(fullPath)

  if (stats.isFile()) {
    return ALLOWED_EXTENSIONS.has(extname(fullPath)) ? [fullPath] : []
  }

  const files = []
  for (const entry of readdirSync(fullPath, { withFileTypes: true })) {
    const childPath = join(fullPath, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'release' || entry.name === 'dist') {
        continue
      }

      files.push(...collectFiles(childPath))
      continue
    }

    if (entry.isFile() && ALLOWED_EXTENSIONS.has(extname(childPath))) {
      files.push(childPath)
    }
  }

  return files
}

const rawTargets = process.argv.slice(2)
const targets = rawTargets.length > 0 ? rawTargets : DEFAULT_TARGETS
const existingTargets = targets.filter((target) => {
  try {
    statSync(resolve(ROOT, target))
    return true
  } catch {
    return false
  }
})

const files = [...new Set(existingTargets.flatMap((target) => collectFiles(target)))]
const offenders = files.filter((file) => SUSPICIOUS_TEXT_PATTERN.test(readFileSync(file, 'utf8')))

if (offenders.length > 0) {
  console.error('Detected suspicious mojibake markers in:')
  for (const offender of offenders) {
    console.error(`- ${offender}`)
  }
  process.exit(1)
}

console.log(`Encoding check passed for ${files.length} file(s).`)
