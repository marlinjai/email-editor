#!/usr/bin/env node
/**
 * Pack each published editor package and check the TARBALL, the artifact a
 * consumer downloads, rather than the workspace, where `workspace:` ranges and
 * private packages resolve by definition and so prove nothing.
 *
 * For every package it asserts:
 *   - no `workspace:` range survives in any dependency field
 *   - no dependency on a private workspace package (such as @email-editor/shared)
 *   - publishConfig.access is "public", the version matches the release, and
 *     sibling editor packages are depended on at that same version
 *   - repository points at this repository and the package's directory (npm
 *     refuses a provenance publish whose repository does not match the workflow)
 *   - every file named by main, module, types and exports is in the tarball,
 *     LICENSE and README.md are in it, and no sources or tests are
 *
 * Usage:
 *   node scripts/check-packed-manifests.mjs            check, then delete the tarballs
 *   node scripts/check-packed-manifests.mjs --out DIR  keep the checked tarballs in DIR
 *                                                      (the publish workflow uploads exactly these)
 *   node scripts/check-packed-manifests.mjs --version 0.1.0
 *                                                      also require this version (the tag's)
 *
 * The packages must be built first (`pnpm run build`): an unbuilt package
 * fails the "files named by exports exist" check, which is the point.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** The packages this release publishes, in dependency order. */
export const EDITOR_PACKAGES = ['core', 'blocks', 'ui', 'editor'];
const REPOSITORY_URL = 'git+https://github.com/marlinjai/email-editor.git';
const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const keepDir = argValue('--out') ? resolve(argValue('--out')) : undefined;
const requiredVersion = argValue('--version');

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Every package in the workspace that is marked private, by name. */
function privateWorkspacePackages() {
  const names = new Set();
  for (const group of ['packages', 'apps', 'examples']) {
    const dir = join(repoRoot, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const manifest = join(dir, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(manifest)) {
        const pkg = readJson(manifest);
        if (pkg.private === true && pkg.name) names.add(pkg.name);
      }
    }
  }
  return names;
}

/** Collect every file path referenced by an exports map (conditions nest). */
function exportTargets(exportsField, out = []) {
  if (typeof exportsField === 'string') out.push(exportsField);
  else if (exportsField && typeof exportsField === 'object') {
    for (const value of Object.values(exportsField)) exportTargets(value, out);
  }
  return out;
}

const normalize = (p) => p.replace(/^\.\//, '');

const privateNames = privateWorkspacePackages();
const sources = EDITOR_PACKAGES.map((dir) => ({ dir, ...readJson(join(repoRoot, 'packages', dir, 'package.json')) }));
const editorNames = new Set(sources.map((p) => p.name));
const releaseVersion = requiredVersion ?? sources[0].version;

if (sources.length === 0) {
  console.error('check-packed-manifests: no packages to check. Refusing to pass vacuously.');
  process.exit(1);
}

const workDir = mkdtempSync(join(tmpdir(), 'packcheck-'));
if (keepDir) mkdirSync(keepDir, { recursive: true });
let failed = false;

for (const source of sources) {
  const problems = [];
  const packDir = join(workDir, source.dir);
  mkdirSync(packDir);
  // Pack from inside the package directory: pnpm rewrites workspace: ranges
  // on pack, which npm does not, and this is the tarball that gets published.
  execFileSync('pnpm', ['pack', '--pack-destination', packDir], {
    cwd: join(repoRoot, 'packages', source.dir),
    stdio: 'pipe',
  });
  const tarball = readdirSync(packDir).find((f) => f.endsWith('.tgz'));
  if (!tarball) {
    console.error(`FAIL ${source.name}: pnpm pack produced no tarball`);
    failed = true;
    continue;
  }
  const tarPath = join(packDir, tarball);
  const files = new Set(
    execFileSync('tar', ['-tzf', tarPath], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => f.replace(/^package\//, ''))
  );
  const pkg = JSON.parse(execFileSync('tar', ['-xzOf', tarPath, 'package/package.json'], { encoding: 'utf8' }));

  for (const field of DEP_FIELDS) {
    for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        problems.push(`${field}.${dep} is still "${range}": the tarball would be uninstallable`);
      }
      if (field !== 'devDependencies' && privateNames.has(dep)) {
        problems.push(`${field}.${dep} is a private workspace package, which is never published`);
      }
      if (field !== 'devDependencies' && editorNames.has(dep) && range !== `^${releaseVersion}`) {
        problems.push(`${field}.${dep} is "${range}", expected "^${releaseVersion}" (the version released with it)`);
      }
    }
  }

  if (pkg.private === true) problems.push('is marked private');
  if (pkg.publishConfig?.access !== 'public') problems.push('publishConfig.access is not "public"');
  if (pkg.version !== releaseVersion) problems.push(`version is ${pkg.version}, expected ${releaseVersion}`);
  if (pkg.repository?.url !== REPOSITORY_URL) problems.push(`repository.url is ${JSON.stringify(pkg.repository?.url)}, expected ${REPOSITORY_URL}`);
  if (pkg.repository?.directory !== `packages/${source.dir}`) problems.push(`repository.directory is not packages/${source.dir}`);
  if (!pkg.license) problems.push('has no license');

  const referenced = [pkg.main, pkg.module, pkg.types, ...exportTargets(pkg.exports)].filter(Boolean).map(normalize);
  for (const file of new Set(referenced)) {
    if (!files.has(file)) problems.push(`references ${file}, which is not in the tarball (built?)`);
  }
  for (const required of ['LICENSE', 'README.md', 'package.json']) {
    if (!files.has(required)) problems.push(`tarball has no ${required}`);
  }
  const leaked = [...files].filter((f) => f.startsWith('src/') || /(^|\/)__tests__\/|\.test\.[cm]?[jt]sx?$/.test(f));
  if (leaked.length > 0) problems.push(`tarball ships sources or tests: ${leaked.slice(0, 5).join(', ')}${leaked.length > 5 ? ', ...' : ''}`);

  if (problems.length > 0) {
    failed = true;
    console.error(`FAIL ${pkg.name}@${pkg.version} (${tarball})`);
    for (const problem of problems) console.error(`       ${problem}`);
  } else {
    console.log(`ok   ${pkg.name}@${pkg.version}  ${files.size} files`);
    if (keepDir) execFileSync('cp', [tarPath, join(keepDir, tarball)]);
  }
}

rmSync(workDir, { recursive: true, force: true });
if (failed) {
  console.error('\ncheck-packed-manifests: at least one tarball is not publishable.');
  process.exit(1);
}
console.log(`\nchecked ${sources.length} packed package(s) at ${releaseVersion}: publishable${keepDir ? `, tarballs in ${keepDir}` : ''}`);
