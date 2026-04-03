import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const GRAPH_PATH = path.join(ROOT, '.understand-anything', 'knowledge-graph.json')
const META_PATH = path.join(ROOT, '.understand-anything', 'meta.json')

async function run() {
  try {
    console.log('Reading meta.json to determine last analyzed commit...')
    let lastCommit = 'HEAD~1'
    try {
      const metaRaw = await fs.readFile(META_PATH, 'utf8')
      const meta = JSON.parse(metaRaw)
      if (meta.commitHash) lastCommit = meta.commitHash
    } catch (e) {
      console.warn('Could not read meta.json, using HEAD~1')
    }

    console.log(`Getting changed files since ${lastCommit}...`)
    let changedFilesRaw = ''
    try {
      changedFilesRaw = execSync(`git diff ${lastCommit}..HEAD --name-only`, { cwd: ROOT, encoding: 'utf8' })
    } catch (e) {
      console.error('Error running git diff', e)
      process.exit(1)
    }

    const CHANGED_FILES = changedFilesRaw.split('\n').map(l => l.trim()).filter(Boolean)

    if (CHANGED_FILES.length === 0) {
      console.log('No changed files detected.')
      return
    }

    console.log(`Reading knowledge-graph.json...`)
    const graphRaw = await fs.readFile(GRAPH_PATH, 'utf8')
    const graph = JSON.parse(graphRaw)

    if (!graph.nodes) graph.nodes = []

    console.log(`Updating ${CHANGED_FILES.length} files...`)
    
    for (const filePath of CHANGED_FILES) {
      const isConfig = filePath.endsWith('.json') || filePath.endsWith('.yaml') || filePath.endsWith('.yml') || filePath.endsWith('.md')
      const nodeId = isConfig ? `config:${filePath}` : `file:${filePath}`
      const fileName = path.basename(filePath)
      
      const existingIndex = graph.nodes.findIndex(n => n.id === nodeId || n.filePath === filePath)
      
      const nodeData = {
        id: nodeId,
        type: isConfig ? 'config' : 'file',
        name: fileName,
        filePath: filePath,
        summary: `Updated automatically from git diff.`,
        tags: ['auto-updated'],
        complexity: 'moderate'
      }

      if (existingIndex >= 0) {
        graph.nodes[existingIndex] = { ...graph.nodes[existingIndex], ...nodeData }
        console.log(`[UPDATED] ${filePath}`)
      } else {
        graph.nodes.push(nodeData)
        console.log(`[ADDED] ${filePath}`)
      }
    }

    const now = new Date().toISOString()
    const latestCommit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()

    if (!graph.project) graph.project = {}
    graph.project.analyzedAt = now
    
    await fs.writeFile(GRAPH_PATH, JSON.stringify(graph, null, 2))
    console.log('✅ knowledge-graph.json updated!')

    try {
      const metaRaw = await fs.readFile(META_PATH, 'utf8')
      const meta = JSON.parse(metaRaw)
      meta.createdAt = now 
      meta.commitHash = latestCommit
      await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2))
      console.log('✅ meta.json updated!')
    } catch {
      // Ignored
    }

  } catch (err) {
    console.error('Error updating Graph:', err)
  }
}

run()
