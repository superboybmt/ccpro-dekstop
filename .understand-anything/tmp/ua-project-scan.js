const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.argv[2];
const outputPath = process.argv[3];

try {
  let files = [];
  try {
    const gitOutput = execSync('git ls-files -c -o --exclude-standard', { cwd: projectRoot, encoding: 'utf-8' });
    files = gitOutput.split('\n').map(f => f.trim()).filter(f => f.length > 0);
  } catch (e) {
    // fallback
  }

  const excludePatterns = [
    /node_modules\//, /\.git\//, /vendor\//, /venv\//, /\.venv\//, /__pycache__\//,
    /dist\//, /build\//, /out\//, /coverage\//, /\.next\//, /\.cache\//, /\.turbo\//, /target\//,
    /\.lock$/, /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/,
    /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp3|mp4|pdf|zip|tar|gz)$/i,
    /\.min\.js$/, /\.min\.css$/, /\.map$/, /\.d\.ts$/, /\.generated\./,
    /\.idea\//, /\.vscode\//,
    /^LICENSE$/, /^\.gitignore$/, /^\.editorconfig$/, /^\.prettierrc$/, /^\.eslintrc/, /\.log$/
  ];

  files = files.filter(file => {
    return !excludePatterns.some(pattern => pattern.test(file));
  });

  const extensionToLang = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript',
    '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java', '.rb': 'ruby',
    '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.h': 'cpp', '.hpp': 'cpp',
    '.c': 'c', '.cs': 'csharp', '.swift': 'swift', '.kt': 'kotlin',
    '.php': 'php', '.vue': 'vue', '.svelte': 'svelte',
    '.sh': 'shell', '.bash': 'shell',
    '.md': 'markdown', '.rst': 'markdown',
    '.yaml': 'yaml', '.yml': 'yaml', '.json': 'json', '.toml': 'toml',
    '.sql': 'sql', '.graphql': 'graphql', '.gql': 'graphql', '.proto': 'protobuf',
    '.tf': 'terraform', '.tfvars': 'terraform',
    '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'css', '.sass': 'css', '.less': 'css',
    '.xml': 'xml', '.cfg': 'config', '.ini': 'config', '.env': 'config'
  };

  const fileDataList = [];
  const uniqueLanguages = new Set();
  
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const basename = path.basename(file);
    let lang = extensionToLang[ext] || '';
    if (basename === 'Dockerfile') lang = 'dockerfile';
    else if (basename === 'Makefile') lang = 'makefile';
    else if (basename === 'Jenkinsfile') lang = 'jenkinsfile';

    if (lang) uniqueLanguages.add(lang);

    let category = 'code';
    if (ext === '.md' || ext === '.rst' || ext === '.txt') {
        category = 'docs';
    } else if (['.yaml', '.yml', '.json', '.toml', '.xml', '.cfg', '.ini', '.env'].includes(ext) || ['tsconfig.json', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'].includes(basename)) {
        category = 'config';
    } else if (basename === 'Dockerfile' || basename.startsWith('docker-compose.') || ext === '.tf' || ext === '.tfvars' || basename === 'Makefile' || basename === 'Jenkinsfile' || basename === 'Procfile' || basename === 'Vagrantfile' || file.includes('.github/workflows/') || file === '.gitlab-ci.yml' || file.includes('.circleci/') || ext === '.k8s.yaml' || ext === '.k8s.yml' || file.includes('k8s/') || file.includes('kubernetes/')) {
        category = 'infra';
    } else if (['.sql', '.graphql', '.gql', '.proto', '.prisma', '.csv'].includes(ext) || file.endsWith('.schema.json')) {
        category = 'data';
    } else if (['.sh', '.bash', '.ps1', '.bat'].includes(ext)) {
        category = 'script';
    } else if (['.html', '.htm', '.css', '.scss', '.sass', '.less'].includes(ext)) {
        category = 'markup';
    }

    let sizeLines = 0;
    try {
        const fullPath = path.join(projectRoot, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        sizeLines = content.split('\n').length;
    } catch (e) { }

    fileDataList.push({
        path: file.replace(/\\/g, '/'),
        language: lang,
        sizeLines: sizeLines,
        fileCategory: category
    });
  }

  const frameworks = new Set();
  let projectName = '';
  let rawDescription = '';
  let readmeHead = '';

  try {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          if (pkg.name) projectName = pkg.name;
          if (pkg.description) rawDescription = pkg.description;
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          const knownJsFrameworks = ['react', 'vue', 'svelte', '@angular/core', 'express', 'fastify', 'koa', 'next', 'nuxt', 'vite', 'vitest', 'jest', 'mocha', 'tailwindcss', 'prisma', 'typeorm', 'sequelize', 'mongoose', 'redux', 'zustand', 'mobx'];
          for (const fw of knownJsFrameworks) {
              if (deps[fw]) frameworks.add(fw.charAt(0).toUpperCase() + fw.slice(1));
          }
      }
  } catch(e) {}

  if (!projectName) {
      projectName = path.basename(projectRoot);
  }

  try {
      const readmePath = path.join(projectRoot, 'README.md');
      if (fs.existsSync(readmePath)) {
          const readme = fs.readFileSync(readmePath, 'utf8');
          readmeHead = readme.split('\n').slice(0, 10).join('\n');
      }
  } catch(e) {}

  if (files.some(f => path.basename(f) === 'Dockerfile')) frameworks.add('Docker');
  if (files.some(f => path.basename(f).startsWith('docker-compose.'))) frameworks.add('Docker Compose');
  if (files.some(f => f.endsWith('.tf'))) frameworks.add('Terraform');
  if (files.some(f => f.includes('.github/workflows/'))) frameworks.add('GitHub Actions');

  let estimatedComplexity = 'small';
  const total = files.length;
  if (total > 500) estimatedComplexity = 'very-large';
  else if (total > 150) estimatedComplexity = 'large';
  else if (total > 30) estimatedComplexity = 'moderate';

  const importMap = {};
  for (const f of fileDataList) {
      importMap[f.path] = [];
      if (f.fileCategory !== 'code') continue;
      
      try {
          const content = fs.readFileSync(path.join(projectRoot, f.path), 'utf8');
          const imports = [];
          if (f.language === 'typescript' || f.language === 'javascript') {
              const regex = /(?:import.*from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
              let match;
              while ((match = regex.exec(content)) !== null) {
                  const imp = match[1] || match[2];
                  if (imp.startsWith('.')) imports.push(imp);
              }
          }
          
          for (const imp of imports) {
              const dir = path.dirname(f.path);
              const resolvedBase = path.posix.join(dir, imp);
              const variants = [
                  resolvedBase,
                  resolvedBase + '.ts',
                  resolvedBase + '.tsx',
                  resolvedBase + '.js',
                  resolvedBase + '.jsx',
                  resolvedBase + '/index.ts',
                  resolvedBase + '/index.tsx',
                  resolvedBase + '/index.js',
                  resolvedBase + '/index.jsx'
              ];
              for (const v of variants) {
                  if (files.includes(v)) {
                      importMap[f.path].push(v);
                      break;
                  }
              }
          }
      } catch(e) {}
  }

  const result = {
    scriptCompleted: true,
    name: projectName,
    rawDescription,
    readmeHead,
    languages: Array.from(uniqueLanguages).sort(),
    frameworks: Array.from(frameworks),
    files: fileDataList.sort((a,b) => a.path.localeCompare(b.path)),
    totalFiles: fileDataList.length,
    estimatedComplexity,
    importMap
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
