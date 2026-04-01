import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const GRAPH_PATH = path.join(ROOT, '.understand-anything', 'knowledge-graph.json')
const META_PATH = path.join(ROOT, '.understand-anything', 'meta.json')

const CHANGED_FILES = [
  'src/main/services/update-service.ts',
  'src/renderer/src/components/UpdateNotifier.tsx',
  'src/renderer/src/App.tsx',
  'src/main/ipc/register-handlers.ts',
  'src/preload/index.ts',
  'src/shared/api.ts',
  'src/shared/semver.ts',
  'version.json'
]

async function run() {
  try {
    console.log('Đọc knowledge-graph.json...')
    const graphRaw = await fs.readFile(GRAPH_PATH, 'utf8')
    const graph = JSON.parse(graphRaw)

    // Khởi tạo nếu thiếu
    if (!graph.nodes) graph.nodes = []

    console.log(`Tiến hành cập nhật ${CHANGED_FILES.length} files...`)
    
    for (const filePath of CHANGED_FILES) {
      const nodeId = filePath.endsWith('.json') ? `config:${filePath}` : `file:${filePath}`
      const fileName = path.basename(filePath)
      
      // Tìm xem node đã tồn tại chưa
      const existingIndex = graph.nodes.findIndex(n => n.id === nodeId || n.filePath === filePath)
      
      const nodeData = {
        id: nodeId,
        type: filePath.endsWith('.json') ? 'config' : 'file',
        name: fileName,
        filePath: filePath,
        summary: filePath.includes('update') ? 'Module quản lý tính năng cập nhật phiên bản ứng dụng tự động.' : 'File đã được cập nhật logic liên quan đến versioning.',
        tags: ['update', 'semver', 'auto-update'],
        complexity: 'moderate' // Mặc định
      }

      if (existingIndex >= 0) {
        // Cập nhật node cũ (giữ lại các tag/summary cũ nếu có thể nhưng ở đây ta đè nhanh)
        graph.nodes[existingIndex] = { ...graph.nodes[existingIndex], ...nodeData }
        console.log(`[UPDATED] ${filePath}`)
      } else {
        // Thêm node mới
        graph.nodes.push(nodeData)
        console.log(`[ADDED] ${filePath}`)
      }
    }

    // Cập nhật meta.json & timestamp
    const now = new Date().toISOString()
    if (!graph.project) graph.project = {}
    graph.project.analyzedAt = now
    
    // Lưu lại graph
    await fs.writeFile(GRAPH_PATH, JSON.stringify(graph, null, 2))
    console.log('✅ Cập nhật knowledge-graph.json thành công!')

    // Cập nhật meta
    try {
      const metaRaw = await fs.readFile(META_PATH, 'utf8')
      const meta = JSON.parse(metaRaw)
      meta.createdAt = now // Update timestamp
      await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2))
      console.log('✅ Cập nhật meta.json thành công!')
    } catch {
      // Bỏ qua nếu không có meta
    }

  } catch (err) {
    console.error('Lỗi khi cập nhật Graph:', err)
  }
}

run()
