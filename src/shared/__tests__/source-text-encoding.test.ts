import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../..')
const TARGET_DIRECTORIES = ['src', 'scripts']
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.py'])
const SUSPICIOUS_TEXT_PATTERN = /\u00C3.|\u00C2.|\u00C4.|\u00E2\u20AC|\uFFFD/

const collectFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'release' || entry.name === 'dist') {
        continue
      }

      files.push(...collectFiles(fullPath))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const extension = fullPath.slice(fullPath.lastIndexOf('.'))
    if (TARGET_EXTENSIONS.has(extension)) {
      files.push(fullPath)
    }
  }

  return files
}

describe('source text encoding', () => {
  it('does not contain mojibake markers in source files', () => {
    const files = TARGET_DIRECTORIES.flatMap((directory) => collectFiles(join(ROOT, directory)))
    const offenders = files.filter((file) => {
      if (!statSync(file).isFile()) return false
      const content = readFileSync(file, 'utf8')
      return SUSPICIOUS_TEXT_PATTERN.test(content)
    })

    expect(offenders).toEqual([])
  })
})
