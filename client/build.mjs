// @ts-check
import { readFile, writeFile, rename } from 'node:fs/promises';
import { build } from 'tsup';
import { dtsPlugin } from "esbuild-plugin-d.ts";

console.log('Building script-bridge-client...');

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const header = `// AUTOGENERATED FILE. DO NOT EDIT.
//
// @script-bridge/client@${packageJson.version}
// author: ${packageJson.author}
// license: ${packageJson.license}
// repository: ${packageJson.homepage}
//`;

const outDir = 'build'

await build({
  entryPoints: ['src/index.ts'],
  outDir,
  target: 'es2021',
  platform: 'neutral',
  format: 'esm',
  external: ['@minecraft/server', '@minecraft/server-net'],
  noExternal: ['@script-bridge/protocol'],
  bundle: true,
  minify: true,
  dts: false,
  banner: {
    js: header,
  },
  esbuildPlugins: [
    dtsPlugin({
      experimentalBundling: true,
      outDir,
    })
  ],
  clean: true,
});

await rename('build/index.mjs', 'build/script-bridge-client.js');
await rename('build/index.d.ts', 'build/script-bridge-client.d.ts');

await writeFile(
  'build/script-bridge-client.d.ts',
  header + '\n' + (await readFile('build/script-bridge-client.d.ts', 'utf8'))
);

console.log('Build complete');