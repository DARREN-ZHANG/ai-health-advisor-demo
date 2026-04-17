import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * 构建后将各包的 package.json 入口从 src/ 切到 dist/
 * 让 node 在运行时能正确解析编译后的 JS 文件
 */
const packages = [
  'packages/shared',
  'packages/sandbox',
  'packages/agent-core',
  'packages/ui',
  'packages/charts',
];

for (const pkg of packages) {
  const filePath = path.join(pkg, 'package.json');
  const pkgJson = JSON.parse(await readFile(filePath, 'utf8'));

  pkgJson.main = './dist/index.js';
  pkgJson.types = './dist/index.d.ts';
  pkgJson.exports = {
    '.': {
      types: './dist/index.d.ts',
      require: './dist/index.js',
      import: './dist/index.js',
      default: './dist/index.js',
    },
  };

  await writeFile(filePath, `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf8');
  console.log(`patched: ${pkg}`);
}
