const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

try {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  let description = "No description available";
  if (data.rawDescription) {
    description = data.rawDescription;
  } else if (data.readmeHead) {
    description = data.readmeHead.replace(/\n/g, ' ').substring(0, 150) + "...";
  }

  if (data.totalFiles > 200) {
    description += " Note: this project has over 200 source files; consider scoping analysis to a subdirectory for faster results.";
  }

  const result = {
    name: data.name,
    description: description,
    languages: data.languages,
    frameworks: data.frameworks,
    files: data.files,
    totalFiles: data.totalFiles,
    estimatedComplexity: data.estimatedComplexity,
    importMap: data.importMap
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
