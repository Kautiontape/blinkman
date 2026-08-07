/* Changelog regression test — run with:  node test/changelog-test.js
 *
 * The notes are written once in js/changelog.js and read in two places: the
 * modal behind the version marker, and CHANGELOG.md, which tools/changelog.js
 * generates. Nothing at runtime would notice the file having drifted from the
 * array, so the first check here regenerates it in memory and compares.
 *
 * The rest guards the shape ./tools/release.sh depends on: one Unreleased
 * entry at the top while work is pending, and the version below it being the
 * one PV.VERSION actually ships.
 */
global.window = {};
var fs = require('fs');
var path = require('path');
// Mirrors index.html's relative script order, which puts strings.js first.
['strings.js', 'changelog.js']
  .forEach(function (f) { require(path.join(__dirname, '..', 'js', f)); });
var PV = global.window.PV;
var gen = require(path.join(__dirname, '..', 'tools', 'changelog.js'));

var failures = 0;

function check(label, ok, detail) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label +
    (ok || detail === undefined ? '' : '   got ' + detail));
  if (!ok) failures++;
}

var LOG = PV.CHANGELOG;
var SEMVER = /^\d+\.\d+\.\d+$/;

/* '1.10.0' sorts below '1.9.0' as a string, so the comparison is per-part. */
function compare(a, b) {
  var x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

console.log('');
console.log('CHANGELOG.md is what the generator would write');

(function () {
  var onDisk = fs.readFileSync(gen.target, 'utf8');
  check('the checked-in file matches js/changelog.js',
    onDisk === gen.render(LOG),
    'run node tools/changelog.js');
})();

console.log('');
console.log('the editor writes the array back byte for byte');

/* tools/changelog.html saves by splicing a re-emitted array over the file it
 * loaded. Splicing the unchanged array has to land on the file exactly as
 * checked in, or every save from the GUI would carry a reformatting diff
 * nobody asked for — and the first one would be blamed on the notes. */
(function () {
  var source = fs.readFileSync(path.join(gen.root, 'js', 'changelog.js'), 'utf8');
  var spliced = PV.changelogSource(source, LOG);
  check('the array region is found at all', spliced !== null);
  check('and re-emitting it changes nothing', spliced === source,
    spliced === source ? '' : 'the emitted layout has drifted from the file');
})();

console.log('');
console.log('the Markdown reads back into the array');

/* Editing CHANGELOG.md by hand is a supported way in, so the parse has to be
 * the exact inverse of the render. A version, a date or a note lost on the way
 * back is work destroyed silently — the file still looks fine. */
(function () {
  var back = PV.changelogParse(PV.changelogMarkdown(LOG));
  check('every release survives the round trip', back.length === LOG.length,
    back.length + ' of ' + LOG.length);
  check('and comes back identical',
    JSON.stringify(back) === JSON.stringify(LOG),
    JSON.stringify(back) === JSON.stringify(LOG) ? '' : 'the parse is not the render\'s inverse');
})();

(function () {
  /* The shapes a hand-edited file grows: a wrapped bullet, an asterisk, a
   * plain hyphen before the date, and stray blank lines. */
  var messy = [
    '# Changelog', '', 'Some preamble nobody parses.', '',
    '## Unreleased', '',
    '- A note that someone', '  wrapped across two lines.',
    '* A note that used an asterisk.', '',
    '## 1.0.0 - 2026-08-06', '',
    '- It began.', ''
  ].join('\n');
  var got = PV.changelogParse(messy);

  check('a wrapped bullet folds back into one note',
    got[0].notes[0] === 'A note that someone wrapped across two lines.',
    got[0].notes[0]);
  check('an asterisk bullet counts', got[0].notes.length === 2, got[0].notes.length);
  check('a plain hyphen before the date still splits it',
    got[1].version === '1.0.0' && got[1].date === '2026-08-06',
    got[1].version + ' / ' + got[1].date);
  check('and the preamble is not mistaken for notes', got.length === 2, got.length);
})();

console.log('');
console.log('the shape release.sh stamps');

(function () {
  var unreleased = LOG.filter(function (r) {
    return r.version === PV.CHANGELOG_UNRELEASED;
  });
  check('at most one entry is unreleased', unreleased.length <= 1, unreleased.length);
  check('and it is the first if it exists',
    unreleased.length === 0 || LOG[0].version === PV.CHANGELOG_UNRELEASED,
    LOG[0].version);
  check('an unreleased entry carries no date',
    unreleased.every(function (r) { return r.date === ''; }));

  /* The newest cut version has to be the one on screen and in the zip.
   * Releasing without stamping the heading would leave them disagreeing, and
   * this is the check that would catch it. */
  var newest = LOG.filter(function (r) { return r.version !== PV.CHANGELOG_UNRELEASED; })[0];
  check('the newest released entry is PV.VERSION',
    newest && newest.version === PV.VERSION,
    newest && newest.version + ' vs ' + PV.VERSION);
})();

(function () {
  var released = LOG.filter(function (r) { return r.version !== PV.CHANGELOG_UNRELEASED; });
  check('every released version is a three-part version',
    released.every(function (r) { return SEMVER.test(r.version); }),
    released.map(function (r) { return r.version; }).join(' '));
  check('and every one carries a date',
    released.every(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.date); }));

  var descending = true;
  for (var i = 1; i < released.length; i++) {
    if (compare(released[i - 1].version, released[i].version) <= 0) descending = false;
  }
  check('newest first, with no repeats', descending,
    released.map(function (r) { return r.version; }).join(' '));
})();

console.log('');
console.log('the notes themselves');

(function () {
  check('no entry is empty',
    LOG.every(function (r) { return r.notes.length > 0; }));

  /* PV.changelogFault is what tools/changelog.html greys its Save button out
   * on, so a note that fails here is one the editor would have refused. It
   * covers emptiness, angle brackets — the same string has to read as a
   * Markdown bullet and as the contents of an <li> — and end punctuation. */
  var faulty = [];
  LOG.forEach(function (r) {
    r.notes.forEach(function (n) {
      var why = PV.changelogFault(n);
      if (why) faulty.push(r.version + ': ' + why + ' — ' + n.slice(0, 40));
    });
  });
  check('every note passes the editor\'s own check', faulty.length === 0,
    faulty.join('\n           '));

  /* Opening tools/changelog.html and saving without touching anything has to
   * come out as no diff at all. It tidies on the way through, so a note the
   * tidy would rewrite is a note that quietly changes the moment the file is
   * next opened in the editor. */
  check('and is already tidy',
    LOG.every(function (r) {
      return r.notes.every(function (n) { return PV.changelogTidy(n) === n; });
    }));
})();

(function () {
  var html = PV.changelogHtml();
  check('the modal renders every entry',
    (html.match(/<section class="rel">/g) || []).length === LOG.length);
  var notes = LOG.reduce(function (n, r) { return n + r.notes.length; }, 0);
  check('and every note', (html.match(/<li>/g) || []).length === notes);

  /* Not a hypothetical for a file people paste release notes into. */
  var escaped = PV.changelogHtml(
    [{ version: '9.9.9', date: '', notes: ['a <script> & a > b'] }]);
  check('and escapes what a note puts in it',
    escaped.indexOf('<script>') === -1 && escaped.indexOf('&amp;') !== -1,
    escaped);

  /* The same note going the other way: into the file the editor writes. */
  var js = PV.changelogEntriesJs(
    [{ version: '9.9.9', date: '', notes: ["it's a \\ backslash"] }]);
  check('and quotes what a note puts in the source',
    js.indexOf("\\'") !== -1 && js.indexOf('\\\\') !== -1, js);
})();

console.log('');
console.log(failures === 0 ? 'ALL CHANGELOG CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
