// for npm package
import { defineConfig } from 'tsup';

/** @type {import('tsup').Options} */
export const sharedOptions = {
  entry: ['src/index.ts'],
  target: 'es2021',
  format:'esm',
  platform: 'neutral',
  external: ['@minecraft/server', '@minecraft/server-net'],
  clean: true,
}

export default defineConfig({
  ...sharedOptions,
  outDir: 'dist',
  dts: true,
  sourcemap: true,
});