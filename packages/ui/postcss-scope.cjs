// packages/ui/postcss-scope.cjs
// Confine the prebuilt stylesheet to the editor, so it cannot restyle the host page.
//
// Every selector is placed under the editor's root class: Tailwind's reset
// (`html`, `body`, `*`, `h1`, `button`...) then only resets elements inside the
// editor, and utilities become `.ee-root .flex`, which also outranks the reset
// (`.ee-root button`) by specificity. `html`, `body`, `:root` and `:host` map to
// the root itself. Keyframes get an `ee-` prefix, because keyframe names are
// global and a Tailwind 4 host defines `spin`, `ping`, `pulse` and `bounce` too.
//
// The output stays unlayered on purpose: unlayered rules beat a Tailwind 4
// host's `@layer base` and `@layer utilities`, so the host's reset cannot leak
// into the editor either.

const SCOPE = '.ee-root';
const ROOT_ALIASES = new Set(['html', 'body', ':root', ':host']);

function scopeSelector(selector) {
  const trimmed = selector.trim();
  if (trimmed === SCOPE || trimmed.startsWith(`${SCOPE} `) || trimmed.startsWith(`${SCOPE}.`) || trimmed.startsWith(`${SCOPE}:`)) {
    return trimmed;
  }
  // `html`, `body`, `:root`, `:host`, alone or with a pseudo-class, become the root.
  const rootMatch = /^(html|body|:root|:host)((?::[\w-]+(?:\([^)]*\))?)*)$/.exec(trimmed);
  if (rootMatch && ROOT_ALIASES.has(rootMatch[1])) {
    return `${SCOPE}${rootMatch[2] || ''}`;
  }
  // A descendant of html or body (`html body`, `body > div`) is a descendant of the root.
  const leading = /^(html|body)\s*(>|\s)\s*/.exec(trimmed);
  if (leading) {
    return `${SCOPE} ${trimmed.slice(leading[0].length)}`;
  }
  return `${SCOPE} ${trimmed}`;
}

/** @type {import('postcss').PluginCreator<void>} */
const plugin = () => ({
  postcssPlugin: 'email-editor-scope',
  Once(root) {
    const renamed = new Map();
    root.walkAtRules(/keyframes$/i, (atRule) => {
      const name = atRule.params.trim();
      if (!name.startsWith('ee-')) {
        renamed.set(name, `ee-${name}`);
        atRule.params = `ee-${name}`;
      }
    });

    root.walkRules((rule) => {
      const parent = rule.parent;
      if (parent && parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
      rule.selectors = rule.selectors.map(scopeSelector);
    });

    if (renamed.size > 0) {
      root.walkDecls(/^(-webkit-)?animation(-name)?$/i, (decl) => {
        decl.value = decl.value
          .split(',')
          .map((part) =>
            part.replace(/[\w-]+/g, (token) => (renamed.has(token) ? renamed.get(token) : token))
          )
          .join(',');
      });
    }
  },
});
plugin.postcss = true;

module.exports = plugin;
module.exports.scopeSelector = scopeSelector;
module.exports.SCOPE = SCOPE;
