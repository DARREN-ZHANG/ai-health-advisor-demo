import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , packageDir, outputDir] = process.argv;

if (!packageDir || !outputDir) {
  throw new Error('Usage: node scripts/create-runtime-package-json.mjs <package-dir> <output-dir>');
}

const packageJsonPath = path.join(packageDir, 'package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

const runtimePackageJson = {
  ...packageJson,
  main: './dist/index.js',
  types: './dist/index.d.ts',
  exports: {
    '.': {
      types: './dist/index.d.ts',
      require: './dist/index.js',
      import: './dist/index.js',
      default: './dist/index.js',
    },
  },
};

await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, 'package.json'),
  `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
  'utf8',
);
