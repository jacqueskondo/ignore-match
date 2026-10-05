/**
 * Core matching engine for IgnoreMatch. Kept separate from the public class
 * so the logic is testable in isolation and trivially portable.
 */

/**
 * Convert a single gitignore pattern into a RegExp.
 *
 * Translation rules (these are the decisions this library makes):
 *  - `*` matches anything except `/`.
 *  - `?` matches any single character except `/`.
 *  - `**` matches anything including `/`. When `/**` appears it must sit at a
 *    path boundary; we translate `**` only when it is its own segment so that
 *    `a**b` stays a literal-ish `*` (git itself treats `**` specially only as
 *    a full segment, which is the interpretation we adopt).
 *  - A leading `/` anchors the match to the root.
 *  - A trailing `/` restricts the match to directories only.
 *  - `!` negates the rule's contribution.
 *
 * We operate on character codes for the inner loop because building a regex
 * via string concatenation in a hot path is both slow and error-prone; a
 * state machine is easier to reason about than ad-hoc escaping.
 *
 * @param {string} pattern
 * @returns {{regex: RegExp, dirOnly: boolean, negated: boolean}}
 */
export function patternToRegex(pattern) {
  let negated = false;
  let dirOnly = false;
  let p = pattern;

  if (p.startsWith('!')) {
    negated = true;
    p = p.slice(1);
  }
  if (p.endsWith('/')) {
    dirOnly = true;
    p = p.slice(0, -1);
  }

  let anchored = false;
  if (p.startsWith('/')) {
    anchored = true;
    p = p.slice(1);
  }

  const segments = p.split('/');
  const parts = [];
  if (anchored) parts.push('^');

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '**') {
      // `**` as a full segment matches any number of complete segments.
      if (i === 0) {
        parts.push('(?:.+/)?');
      } else {
        parts.push('(?:.+/)?');
      }
      // If this `**` is the last segment, we also match a bare file.
      if (i === segments.length - 1) {
        parts.push('.*');
      }
      continue;
    }

    // Skip the '/' separator when the previous segment was `**`, since the
    // `**` translation already ends with an optional trailing slash.
    if (i > 0 && segments[i - 1] !== '**') parts.push('/');
    parts.push(translateSegment(seg));
  }

  // Unanchored patterns match both at root and under any subdirectory.
  if (!anchored) {
    // Build the regex so it can start either at the beginning or after a `/`.
    const body = parts.join('');
    const regex = new RegExp(`^(?:.*/)?${body}(?:/.*)?$`);
    return { regex, dirOnly, negated };
  }

  const body = parts.join('');
  const regex = new RegExp(`${body}(?:/.*)?$`);
  return { regex, dirOnly, negated };
}

/**
 * Translate a single path segment (no slashes) into a regex fragment.
 * `*` → `[^/]*`, `?` → `[^/]`, everything else is escaped.
 * @param {string} segment
 * @returns {string}
 */
function translateSegment(segment) {
  let out = '';
  for (const ch of segment) {
    if (ch === '*') {
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else if (/[.*+?^${}()|[\]\\]/.test(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Compile a list of raw gitignore lines into ordered rules.
 * Blank lines and lines whose first non-whitespace character is `#` are dropped.
 * @param {string[]} lines
 * @returns {{negated: boolean, regex: RegExp, dirOnly: boolean}[]}
 */
export function compilePatterns(lines) {
  const rules = [];
  for (const raw of lines) {
    if (typeof raw !== 'string') {
      throw new TypeError(`each pattern must be a string, got ${typeof raw}`);
    }
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue;
    if (/^\s*#/.test(line)) continue;
    // Leading spaces are not significant in gitignore; we strip them. This
    // is a deliberate simplification — git treats a leading backslash as an
    // escape for a literal leading space, which we do not support.
    const pattern = line.replace(/^\s+/, '');
    rules.push(patternToRegex(pattern));
  }
  return rules;
}

/**
 * Apply the compiled rules to a normalized path.
 *
 * Precedence is last-match-wins: a later rule overrides an earlier one. This
 * mirrors git's documented behaviour. Negated rules (`!`) flip the current
 * decision; an explicit `!` later in the file can re-include a path that an
 * earlier rule excluded.
 *
 * `dirOnly` rules are skipped when `isDirectory` is false, because a pattern
 * ending in `/` only ever matches directories.
 *
 * @param {{negated: boolean, regex: RegExp, dirOnly: boolean}[]} rules
 * @param {string} path        Normalized, no leading slash, no trailing slash.
 * @param {boolean} isDirectory
 * @returns {boolean}
 */
export function matchPath(rules, path, isDirectory) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDirectory) continue;
    if (rule.regex.test(path)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}
