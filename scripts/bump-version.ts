// scripts/bump-version.js
import path from 'path';

const versionArg = process.argv[2];
if (!versionArg) {
  console.error('Usage: bun bump-version.js <version>');
  process.exit(1);
}

const packages = [
  '.', // root
  'server',
  'client',
  'protocol'
];

for (const pkgPath of packages) {
  const file = Bun.file(path.join(pkgPath, 'package.json'));
  const packageJson = await file.json();

  const current = packageJson.version;

  switch (versionArg) {
    case 'major':
      packageJson.version = bumpVersion(current, 'major');
      break;
    case 'minor':
      packageJson.version = bumpVersion(current, 'minor');
      break;
    case 'patch':
      packageJson.version = bumpVersion(current, 'patch');
      break;
    default:
      packageJson.version = versionArg;
  }

  await file.write(JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Updated ${pkgPath} to ${packageJson.version}`);
}

function bumpVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
  const [major, minor, patch] = version.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major! + 1}.0.0`;
    case 'minor':
      return `${major!}.${minor! + 1}.0`;
    case 'patch':
      return `${major!}.${minor!}.${patch! + 1}`;
    default:
      throw new Error(`Unknown version type: ${type}`);
  }
}