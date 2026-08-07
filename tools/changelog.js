#!/usr/bin/env node
/* changelog.js — keep js/changelog.js and CHANGELOG.md saying the same thing.
 *
 *     node tools/changelog.js             CHANGELOG.md from js/changelog.js
 *     node tools/changelog.js --from-md   js/changelog.js from CHANGELOG.md
 *     node tools/changelog.js --force     write the Markdown anyway
 *     node tools/changelog.js --check     exit 1 if the two disagree
 *
 * The notes live in js/changelog.js because the game reads them there, so that
 * file is the one that ships and the default direction writes outward from it.
 * Editing the Markdown is the more natural thing to reach for though, so
 * --from-md exists and the default refuses rather than overwrites when it
 * looks like that is what happened: if CHANGELOG.md is newer than
 * js/changelog.js and the two disagree, the Markdown is holding edits nothing
 * else has, and clobbering them loses work no VCS can give back.
 *
 * tools/changelog.html is this same pair of conversions with an editor in
 * front of them, and writes both files itself.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var target = path.join(root, 'CHANGELOG.md');
var source = path.join(root, 'js', 'changelog.js');

/* js/changelog.js is a browser script hanging off window.PV, the same way
 * test/maze-test.js loads js/maze.js. */
function load() {
  global.window = global.window || {};
  require(source);
  return global.window.PV;
}

function render(entries) {
  return load().changelogMarkdown(entries);
}

function mtime(file) {
  try { return fs.statSync(file).mtimeMs; } catch (e) { return 0; }
}

/* Non-null when CHANGELOG.md is the file holding the newer edits, in which
 * case writing over it is the one thing not to do. */
function markdownIsAhead(PV) {
  if (!fs.existsSync(target)) return null;
  if (mtime(target) <= mtime(source)) return null;
  var fromMd = PV.changelogParse(fs.readFileSync(target, 'utf8'));
  return PV.changelogSame(fromMd, PV.CHANGELOG) ? null : fromMd;
}

function toMarkdown(force) {
  var PV = load();
  if (!force && markdownIsAhead(PV)) {
    console.error(
      'CHANGELOG.md is newer than js/changelog.js and says something different.\n' +
      'It is holding edits the array has not seen, and this would erase them.\n\n' +
      '  node tools/changelog.js --from-md    pull them into js/changelog.js\n' +
      '  node tools/changelog.js --force      discard them and write anyway');
    process.exit(1);
  }
  fs.writeFileSync(target, PV.changelogMarkdown());
  console.log('wrote ' + path.relative(root, target));
}

/* Only the array is rewritten; this file's header comment and every function
 * under it are left exactly as found. */
function fromMarkdown() {
  var PV = load();
  var entries = PV.changelogParse(fs.readFileSync(target, 'utf8'));
  if (!entries.length) {
    console.error('no releases found in ' + path.relative(root, target));
    process.exit(1);
  }
  var next = PV.changelogSource(fs.readFileSync(source, 'utf8'), entries);
  if (next === null) {
    console.error('could not find PV.CHANGELOG in ' + path.relative(root, source));
    process.exit(1);
  }
  fs.writeFileSync(source, next);
  // Written back out so the Markdown lands in the exact shape the generator
  // produces, rather than staying in whatever shape it was hand-edited into.
  fs.writeFileSync(target, PV.changelogMarkdown(entries));
  console.log('wrote ' + path.relative(root, source) + ' from ' +
    path.relative(root, target) + ' (' + entries.length + ' releases)');
}

/* Neither direction, just the question. ./tools/release.sh asks it before it
 * stamps anything, because past that point the array is newer by construction
 * and no later check could tell an edit apart from the stamp. */
function check() {
  var PV = load();
  if (!fs.existsSync(target)) {
    console.error('no ' + path.relative(root, target) + ' — run: node tools/changelog.js');
    process.exit(1);
  }
  var fromMd = PV.changelogParse(fs.readFileSync(target, 'utf8'));
  if (PV.changelogSame(fromMd, PV.CHANGELOG)) return;
  console.error(
    'js/changelog.js and CHANGELOG.md say different things. Reconcile them:\n\n' +
    '  node tools/changelog.js --from-md    keep what CHANGELOG.md says\n' +
    '  node tools/changelog.js --force      keep what js/changelog.js says');
  process.exit(1);
}

module.exports = { render: render, load: load, target: target, source: source, root: root };

if (require.main === module) {
  var args = process.argv.slice(2);
  if (args.indexOf('--check') !== -1) check();
  else if (args.indexOf('--from-md') !== -1) fromMarkdown();
  else toMarkdown(args.indexOf('--force') !== -1);
}
