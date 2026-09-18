// scripts/release-sets.mjs
// Which packages this repository publishes, and how they are grouped and tagged.
// Read by scripts/check-packed-manifests.mjs and by .github/workflows/publish.yml.
//
// Print a set's packages (npm names, publish order) for a shell loop:
//   node scripts/release-sets.mjs editor
//   node scripts/release-sets.mjs --all
// Or one line per package, `<set> <tag prefix> <dir> <npm name> <version>`, for scripts:
//   node scripts/release-sets.mjs --table

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every published package, grouped into release sets. A set is versioned and
 * tagged together (`<tag><version>`, for example editor-v0.1.0); its packages
 * are listed in dependency order, which is also the publish order.
 */
export const RELEASE_SETS = {
  editor: { tag: 'editor-v', dirs: ['core', 'blocks', 'ui', 'editor'] },
  mail: { tag: 'mail-v', dirs: ['mail-contract', 'mail-sdk'] },
};

/**
 * Public packages that no release set publishes yet: the platform packages the
 * mail-service plan rebuilds on top of the service. A new public package must
 * go into a release set or into this list, so none is forgotten silently.
 */
export const NOT_RELEASED = [
  'analytics',
  'automation',
  'campaigns',
  'contacts',
  'send-adapter-resend',
  'teams',
  'templates',
];

/** The set a tag belongs to, or undefined: `editor-v0.1.0` -> ['editor', '0.1.0']. */
export function setForTag(tag) {
  for (const [name, set] of Object.entries(RELEASE_SETS)) {
    if (tag.startsWith(set.tag)) return [name, tag.slice(set.tag.length)];
  }
  return undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const manifest = (dir) => JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8'));
  if (process.argv[2] === '--table') {
    for (const [name, set] of Object.entries(RELEASE_SETS)) {
      for (const dir of set.dirs) {
        const pkg = manifest(dir);
        console.log([name, set.tag, dir, pkg.name, pkg.version].join(' '));
      }
    }
    process.exit(0);
  }
  const wanted = process.argv[2] === '--all' ? Object.keys(RELEASE_SETS) : [process.argv[2]];
  const set = { dirs: wanted.flatMap((name) => RELEASE_SETS[name]?.dirs ?? []) };
  if (wanted.some((name) => !RELEASE_SETS[name])) {
    console.error(`release-sets: unknown set ${JSON.stringify(process.argv[2])}; known: ${Object.keys(RELEASE_SETS).join(', ')}`);
    process.exit(1);
  }
  for (const dir of set.dirs) console.log(manifest(dir).name);
}
