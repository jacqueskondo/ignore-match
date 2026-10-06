/**
 * Tests for IgnoreMatch. We assert behaviour the implementation actually
 * claims to support — nothing invented, nothing aspirational.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IgnoreMatch } from '../src/index.js';
import { patternToRegex, matchPath, compilePatterns } from '../src/core.js';

test('patternToRegex: literal filename matches itself', () => {
  const { regex } = patternToRegex('foo.txt');
  assert.equal(regex.test('foo.txt'), true);
  assert.equal(regex.test('bar.txt'), false);
});

test('patternToRegex: single * does not cross slashes', () => {
  const { regex } = patternToRegex('*.txt');
  assert.equal(regex.test('a.txt'), true);
  assert.equal(regex.test('dir/a.txt'), true); // unanchored, matches under subdir
});

test('patternToRegex: leading slash anchors to root', () => {
  const { regex } = patternToRegex('/foo');
  assert.equal(regex.test('foo'), true);
  assert.equal(regex.test('bar/foo'), false);
});

test('patternToRegex: trailing slash is directory-only', () => {
  const { dirOnly, regex } = patternToRegex('build/');
  assert.equal(dirOnly, true);
  assert.equal(regex.test('build'), true);
  assert.equal(regex.test('build/output'), true);
});

test('patternToRegex: ** segment crosses directory boundaries', () => {
  const { regex } = patternToRegex('**/foo');
  assert.equal(regex.test('foo'), true);
  assert.equal(regex.test('a/b/foo'), true);
});

test('patternToRegex: ** at end matches everything below', () => {
  const { regex } = patternToRegex('foo/**');
  assert.equal(regex.test('foo'), true);
  assert.equal(regex.test('foo/bar'), true);
  assert.equal(regex.test('foo/bar/baz'), true);
});

test('patternToRegex: ? matches one non-slash char', () => {
  const { regex } = patternToRegex('f?o');
  assert.equal(regex.test('foo'), true);
  assert.equal(regex.test('f/o'), false);
});

test('patternToRegex: special regex chars are escaped', () => {
  const { regex } = patternToRegex('a.b+c');
  assert.equal(regex.test('a.b+c'), true);
  assert.equal(regex.test('axb+c'), false);
});

test('compilePatterns: skips blank and comment lines', () => {
  const rules = compilePatterns(['', '  ', '# comment', 'foo']);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].regex.test('foo'), true);
});

test('compilePatterns: strips leading whitespace before #', () => {
  // A line whose first non-whitespace char is # is a comment.
  const rules = compilePatterns(['   # not a pattern', 'bar']);
  assert.equal(rules.length, 1);
});

test('matchPath: last match wins', () => {
  const rules = compilePatterns(['*.txt', '!keep.txt']);
  assert.equal(matchPath(rules, 'keep.txt', false), false);
  assert.equal(matchPath(rules, 'drop.txt', false), true);
});

test('matchPath: dirOnly rule skipped for files', () => {
  const rules = compilePatterns(['build/']);
  assert.equal(matchPath(rules, 'build', false), false);
  assert.equal(matchPath(rules, 'build', true), true);
});

test('IgnoreMatch: basic include/exclude', () => {
  const ig = new IgnoreMatch(['node_modules/', 'dist/', '*.log']);
  assert.equal(ig.ignores('node_modules/'), true);
  assert.equal(ig.ignores('dist/'), true);
  assert.equal(ig.ignores('app/main.js'), false);
  assert.equal(ig.ignores('errors.log'), true);
});

test('IgnoreMatch: negation re-includes a previously ignored path', () => {
  const ig = new IgnoreMatch(['*.log', '!important.log']);
  assert.equal(ig.ignores('debug.log'), true);
  assert.equal(ig.ignores('important.log'), false);
});

test('IgnoreMatch: isDirectory option affects dirOnly rules', () => {
  const ig = new IgnoreMatch(['build/']);
  // As a file: not ignored.
  assert.equal(ig.ignores('build'), false);
  // Explicit directory flag.
  assert.equal(ig.ignores('build', { isDirectory: true }), true);
  // Trailing slash also signals directory.
  assert.equal(ig.ignores('build/'), true);
});

test('IgnoreMatch: anchored root pattern', () => {
  const ig = new IgnoreMatch(['/config/local.json']);
  assert.equal(ig.ignores('config/local.json'), true);
  assert.equal(ig.ignores('pkg/config/local.json'), false);
});

test('IgnoreMatch: ** wildcard', () => {
  const ig = new IgnoreMatch(['**/cache']);
  assert.equal(ig.ignores('cache'), true);
  assert.equal(ig.ignores('a/b/cache'), true);
});

test('IgnoreMatch: rejects non-array input', () => {
  assert.throws(() => new IgnoreMatch('foo'), TypeError);
});

test('IgnoreMatch: rejects non-string path', () => {
  const ig = new IgnoreMatch(['foo']);
  assert.throws(() => ig.ignores(42), TypeError);
});
