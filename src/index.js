/**
 * IgnoreMatch — gitignore-style pattern matching for paths.
 *
 * The library exports a single class `IgnoreMatch` that compiles a list of
 * gitignore-style patterns and answers whether a given path is ignored.
 *
 * Design decision: we implement the subset of gitignore semantics that covers
 * the cases people actually rely on — literal paths, `*` and `?` wildcards,
 * `**` for directory recursion, leading `/` for anchoring, trailing `/` for
 * directory-only matches, and `!` for negation with last-pattern-wins
 * precedence. Syntactic corners git itself handles (character classes,
 * escaped spaces, per-line comments beyond `#` at column 0) are intentionally
 * out of scope; documenting them would overstate what the matcher does.
 */

import { compilePatterns, matchPath } from './core.js';

export class IgnoreMatch {
  /**
   * @param {string[]} patterns  Raw gitignore-style lines. Empty lines and
   *                             lines beginning with `#` are ignored.
   */
  constructor(patterns) {
    if (!Array.isArray(patterns)) {
      throw new TypeError(`patterns must be an array of strings, got ${typeof patterns}`);
    }
    /** @private @type {{negated: boolean, regex: RegExp, dirOnly: boolean}[]} */
    this._rules = compilePatterns(patterns);
  }

  /**
   * Returns true when `path` is ignored under the compiled rules.
   *
   * `path` should be a forward-slash-delimited relative path. A trailing
   * slash on `path` signals that the caller is asking about a directory;
   * this matters because rules with a trailing slash only match directories.
   *
   * @param {string} path
   * @param {object} [options]
   * @param {boolean} [options.isDirectory]  Explicit directory flag. When
   *                                         omitted, a trailing slash on
   *                                         `path` is used instead.
   * @returns {boolean}
   */
  ignores(path, options = {}) {
    if (typeof path !== 'string') {
      throw new TypeError(`path must be a string, got ${typeof path}`);
    }
    let normalized = path.replace(/\\+/g, '/');
    let isDirectory = options.isDirectory;
    if (isDirectory === undefined) {
      if (normalized.endsWith('/')) {
        isDirectory = true;
        normalized = normalized.slice(0, -1);
      } else {
        isDirectory = false;
      }
    }
    if (normalized.startsWith('/')) normalized = normalized.slice(1);
    return matchPath(this._rules, normalized, isDirectory);
  }
}
