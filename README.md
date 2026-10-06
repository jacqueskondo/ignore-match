# IgnoreMatch

Filter paths with gitignore-style patterns, applying last-pattern-wins precedence.

## Usage

```js
import { IgnoreMatch } from 'ignore-match';

const ig = new IgnoreMatch([
  'node_modules/',
  'dist/',
  '*.log',
  '!keep.log',
]);

ig.ignores('node_modules/express/index.js'); // true
ig.ignores('dist/main.js');                   // true
ig.ignores('app/errors.log');                 // true
ig.ignores('keep.log');                       // false (negated)
ig.ignores('build', { isDirectory: true });   // depends on your rules
```

## Why

Every project that walks a file tree eventually needs to skip the files its
users don't care about. Reaching for a full git implementation pulls in a
lot of machinery for a problem that, in practice, is small. This library
handles the subset of gitignore semantics that covers real-world ignore
files: literal paths, `*` and `?` wildcards, `**` for directory recursion,
leading `/` for anchoring, trailing `/` for directory-only matches, and `!`
negation with last-match-wins precedence.

The trade-off is explicit: we do not support character classes, escaped
spaces, or per-line comments beyond a `#` at the first column. If you need
those, use git itself.

## Edge case you will hit

A pattern with a trailing slash (`build/`) only matches directories. To
get the right answer for a path you have not yet stat'd, pass the
`isDirectory` option explicitly. Without it, the matcher guesses from a
trailing slash on the path — which is wrong for paths that happen to end in
`/` for other reasons or for bare filenames.
