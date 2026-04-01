const fs = require('fs');

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const metaOutputPath = process.argv[4];

try {
  const scan = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  // Create nodes
  const nodes = [];
  
  // Add a project-level node
  nodes.push({
      id: "project:main",
      type: "project",
      name: scan.name,
      description: scan.description,
      metadata: {
          frameworks: scan.frameworks,
          languages: scan.languages
      }
  });

  // Create component nodes based on directories
  const dirSet = new Set();
  scan.files.forEach(f => {
      const parts = f.path.split('/');
      if (parts.length > 1) {
          dirSet.add(parts[0]);
      }
  });

  Array.from(dirSet).forEach(dir => {
      nodes.push({
          id: `module:${dir}`,
          type: "concept",
          name: dir,
          description: `Directory containing ${dir} related files`,
          metadata: {}
      });
  });

  scan.files.forEach(f => {
      nodes.push({
          id: `file:${f.path}`,
          type: "file",
          name: f.path,
          description: `${f.fileCategory} file in ${f.language || 'unknown'}`,
          metadata: {
              lines: f.sizeLines,
              category: f.fileCategory
          }
      });
  });

  // Create edges
  const edges = [];
  
  scan.files.forEach(f => {
      const parts = f.path.split('/');
      if (parts.length > 1) {
          edges.push({
              source: `module:${parts[0]}`,
              target: `file:${f.path}`,
              type: "contains"
          });
      }
      
      edges.push({
          source: "project:main",
          target: `file:${f.path}`,
          type: "contains"
      });

      const imports = scan.importMap[f.path] || [];
      imports.forEach(imp => {
          edges.push({
              source: `file:${f.path}`,
              target: `file:${imp}`,
              type: "imports"
          });
      });
  });

  const tourOptions = scan.files.map(f => f.path);
  const tour = tourOptions.slice(0, Math.min(10, tourOptions.length)).map(t => ({
      nodeId: `file:${t}`,
      description: `Review ${t}`
  }));

  const graph = {
      nodes,
      edges,
      layers: [
          {
              name: "Architecture map",
              description: "High level modules",
              nodeIds: ["project:main", ...Array.from(dirSet).map(d => `module:${d}`)]
          }
      ],
      tour: {
          title: "Introduction to " + scan.name,
          description: scan.description,
          steps: tour
      }
  };

  fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2));
  
  const meta = {
      createdAt: new Date().toISOString(),
      commitHash: "dc09078d80ce155475eb7df76f73e599c4bf7eb5",
      version: "1.0.0",
      projectComplexity: scan.estimatedComplexity,
      totalFiles: scan.totalFiles
  };
  fs.writeFileSync(metaOutputPath, JSON.stringify(meta, null, 2));
  
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
