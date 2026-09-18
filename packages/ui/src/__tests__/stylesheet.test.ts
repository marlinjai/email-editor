// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Root } from 'postcss';
import tailwindcss from 'tailwindcss';
const scope = require('../../postcss-scope.cjs');

const pkgDir = join(__dirname, '..', '..');

function isKeyframeStep(rule: postcss.Rule) {
  const parent = rule.parent;
  return parent?.type === 'atrule' && /keyframes$/i.test((parent as postcss.AtRule).name);
}

describe('scopeSelector', () => {
  it.each([
    ['html', '.ee-root'],
    ['body', '.ee-root'],
    [':root', '.ee-root'],
    [':host', '.ee-root'],
    ['*', '.ee-root *'],
    ['::backdrop', '.ee-root ::backdrop'],
    ['button', '.ee-root button'],
    ['[type=button]', '.ee-root [type=button]'],
    ['.flex', '.ee-root .flex'],
    ['.hover\\:bg-x:hover', '.ee-root .hover\\:bg-x:hover'],
    ['.group:hover .group-hover\\:block', '.ee-root .group:hover .group-hover\\:block'],
    ['body > div', '.ee-root div'],
    ['.ee-root', '.ee-root'],
    ['.ee-root .already', '.ee-root .already'],
  ])('%s becomes %s', (input, expected) => {
    expect(scope.scopeSelector(input)).toBe(expected);
  });
});

describe('built stylesheet', () => {
  let css: Root;

  beforeAll(async () => {
    const source = readFileSync(join(pkgDir, 'src', 'styles.css'), 'utf8');
    const result = await postcss([
      tailwindcss({ config: join(pkgDir, 'tailwind.config.js') }),
      scope(),
    ]).process(source, { from: join(pkgDir, 'src', 'styles.css') });
    css = postcss.parse(result.css);
  }, 60_000);

  it('has no selector outside the editor root, so it cannot restyle the host page', () => {
    const unscoped: string[] = [];
    let count = 0;
    css.walkRules((rule) => {
      if (isKeyframeStep(rule)) return;
      for (const selector of rule.selectors) {
        count++;
        if (!selector.startsWith('.ee-root')) unscoped.push(selector);
      }
    });
    expect(count).toBeGreaterThan(100);
    expect(unscoped).toEqual([]);
  });

  it('does not reset the host document (no html, body, :root or bare * rules)', () => {
    const offenders: string[] = [];
    css.walkRules((rule) => {
      if (isKeyframeStep(rule)) return;
      for (const selector of rule.selectors) {
        if (/^(html|body|:root|\*)\b/.test(selector)) offenders.push(selector);
      }
    });
    expect(offenders).toEqual([]);
  });

  it('prefixes keyframes and the animations that use them', () => {
    const names: string[] = [];
    css.walkAtRules(/keyframes$/i, (atRule) => {
      names.push(atRule.params);
    });
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.startsWith('ee-')).toBe(true);
    css.walkDecls(/^animation(-name)?$/, (decl) => {
      if (decl.value === 'none') return;
      expect(decl.value).toMatch(/\bee-/);
    });
  });

  it('ships the design tokens it references', () => {
    const referenced = new Set<string>();
    const defined = new Set<string>();
    css.walkDecls((decl) => {
      if (decl.prop.startsWith('--ee-')) defined.add(decl.prop);
      for (const match of decl.value.matchAll(/var\((--ee-[\w-]+)/g)) referenced.add(match[1]);
    });
    const missing = [...referenced].filter((token) => !defined.has(token));
    expect(missing).toEqual([]);
  });

  it('is unlayered, so a Tailwind 4 host reset in @layer base cannot override it', () => {
    const layers: string[] = [];
    css.walkAtRules('layer', (atRule) => {
      layers.push(atRule.params);
    });
    expect(layers).toEqual([]);
  });
});
