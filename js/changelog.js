/* changelog.js — the release notes, newest first.
 *
 * The source of truth for both places the notes appear: the modal behind the
 * version marker in the menu's bottom corner, and CHANGELOG.md, which
 * `node tools/changelog.js` regenerates from this array. Edit here, then run
 * the generator; test/changelog-test.js fails if the file has drifted.
 *
 * Editing CHANGELOG.md instead works too — `node tools/changelog.js --from-md`
 * reads it back into this array, and the generator refuses to write over a
 * Markdown file that is newer and says something different. tools/changelog.html
 * is both directions with an editor in front of them.
 *
 * Player-facing copy, so the house rules from strings.js apply — no
 * trademarked names, and plain text rather than markup, since the same note
 * has to read as Markdown and as HTML.
 *
 * The newest entry is the one being written toward the next release. Its
 * version is the literal 'Unreleased' with an empty date, and
 * ./tools/release.sh rewrites both as it cuts. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.CHANGELOG = [
    {
      version: 'Unreleased',
      date: '',
      notes: [
        'Level progression! Maps now start off simple and familiar, and slowly ramp up how dense they are as you beat levels.',
        'Added this changelog feature!',
        'Flash and Torch will now be able to stack on each other when picked in succession.',
        'All rounds now open by showing you where you are before fading away.',
        'Torch Hard lost its cone. Bringing back the original mode’s charm!',
        'Torch Easy now follows ghosts during a ping so it’s easier to figure out their movement.',
        'The board edge lights up to indicate more clearly things that used to rely on audible cues.',
        'The rounds no longer immediately kick off automatically; you have to move to start them.'
      ]
    },
    {
      version: '1.5.0',
      date: '2026-08-06',
      notes: [
        'Updated to have 3 game modes: Stare, Torch and Flash. Each one now has an Easy, a Normal and a Hard mode. For those keeping track, that’s 9 total game modes!',
        'Torch now shines the way forward. So it’s more "torch" in the British "flashlight" sense than medieval "flame stick" variety. This should help see ghosts before they run up on you, giving you time to react.',
        'Improved Torch light to fill around corners so you can’t see through walls anymore.',
        'Added a small nudge to people who haven’t hit the number keys to change layers or send a ping. Helpful for anyone who hops in without reading anything (although who knows if they’ll read the prompt).',
        'Toned down the audible siren a bit, and added in a audio cue when your ghost vulnerability is ending.'
      ]
    },
    {
      version: '1.4.0',
      date: '2026-08-06',
      notes: [
        'New mode: Torch. A light travels with you, and you send out a sonar ping to see the world beyond your flame.',
        'Improved main menu with a small demo to get you used to how the game plays before you start.'
      ]
    },
    {
      version: '1.3.0',
      date: '2026-08-06',
      notes: [
        'All four ghosts start in the house now.'
      ]
    },
    {
      version: '1.2.0',
      date: '2026-08-06',
      notes: [
        'Added better cues for when the round start so you see the ghosts and dots and maze. Gives a quick chance to study and understand the map, and less of a surprise when ghosts suddenly show up!'
      ]
    },
    {
      version: '1.1.0',
      date: '2026-08-06',
      notes: [
        'Closed dead-end pockets in mazes that could trap the player and force them to turn around (possibly into a ghost!).',
        'Some UI changes to make the badges on the right also clickable.'
      ]
    },
    {
      version: '1.0.0',
      date: '2026-08-06',
      notes: [
        'Welcome to BLINKMAN! This is the first version with some randomly shuffled mazes to explore, and 4 difficulties.'
      ]
    }
  ];

  /* The heading a not-yet-cut entry carries, and what release.sh looks for. */
  PV.CHANGELOG_UNRELEASED = 'Unreleased';

  /* Every renderer below takes the entries to work on, defaulting to the array
   * above. tools/changelog.html passes the draft being edited, which is how it
   * previews and saves without touching what the page loaded. */
  function entriesOf(entries) { return entries || PV.CHANGELOG; }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }

  /* The modal's body, as a string. No DOM here, so node can run it: main.js
   * only has to assign the result. */
  PV.changelogHtml = function (entries) {
    return entriesOf(entries).map(function (rel) {
      return '<section class="rel">' +
        '<h3>' + escapeHtml(rel.version) +
        (rel.date ? '<span class="rel-date">' + escapeHtml(rel.date) + '</span>' : '') +
        '</h3><ul>' +
        rel.notes.map(function (n) { return '<li>' + escapeHtml(n) + '</li>'; }).join('') +
        '</ul></section>';
    }).join('');
  };

  /* CHANGELOG.md, whole. Lives here rather than in tools/changelog.js so the
   * node generator and tools/changelog.html's preview cannot disagree. */
  PV.CHANGELOG_PREAMBLE = [
    '# Changelog',
    '',
    'Generated from `js/changelog.js` by `tools/changelog.js` — edit the notes',
    'there and run the generator, or open `tools/changelog.html` and use that.',
    'The same notes open in-game from the version marker in the menu\'s bottom',
    'corner.'
  ].join('\n');

  /* One blank line between blocks and exactly one trailing newline, so a
   * second run over an unchanged array is a no-op. */
  PV.changelogMarkdown = function (entries) {
    var out = [PV.CHANGELOG_PREAMBLE];
    entriesOf(entries).forEach(function (rel) {
      out.push('## ' + rel.version + (rel.date ? ' — ' + rel.date : ''));
      out.push(rel.notes.map(function (n) { return '- ' + n; }).join('\n'));
    });
    return out.join('\n\n') + '\n';
  };

  /* CHANGELOG.md back into entries, so editing the Markdown by hand is a
   * supported way in rather than a dead end — `node tools/changelog.js
   * --from-md` and the editor's import button both land here.
   *
   * Forgiving on purpose: it takes `-` or `*` bullets, an em dash or a plain
   * hyphen before the date, and folds a wrapped bullet back onto the note
   * above it, which is what a hand-edited file tends to grow. Everything ahead
   * of the first `##` is preamble and is dropped. */
  PV.changelogParse = function (md) {
    var entries = [];
    var current = null;

    String(md).split('\n').forEach(function (line) {
      var head = /^##\s+(.+)$/.exec(line);
      if (head) {
        var parts = head[1].trim().split(/\s+[—–-]\s+/);
        current = {
          version: parts[0].trim(),
          date: (parts[1] || '').trim(),
          notes: []
        };
        entries.push(current);
        return;
      }
      if (!current) return;

      var bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet) {
        current.notes.push(PV.changelogTidy(bullet[1]));
        return;
      }
      if (line.trim() && current.notes.length) {
        var last = current.notes.length - 1;
        current.notes[last] = PV.changelogTidy(current.notes[last] + ' ' + line);
      }
    });

    return entries.filter(function (rel) { return rel.notes.length > 0; });
  };

  /* Whether two entry arrays say the same thing. The editor and the generator
   * both use it to tell "nothing to do" from "one of these files has edits the
   * other has not seen". */
  PV.changelogSame = function (a, b) {
    return PV.changelogMarkdown(a) === PV.changelogMarkdown(b);
  };

  /* House style, applied so nobody writing a note has to remember it. The
   * whitespace collapse is the load-bearing one: a note is a single-line
   * string in a single-quoted literal, so a pasted line break would be a
   * syntax error rather than a layout problem. */
  PV.changelogTidy = function (s) {
    return String(s)
      .replace(/\s+/g, ' ')
      .replace(/(\w)'(\w)/g, '$1’$2')
      .replace(/\s--\s/g, ' — ')
      .trim();
  };

  /* What is wrong with a note, or null. One definition, so the editor can
   * refuse to save exactly what test/changelog-test.js refuses to pass, and
   * say the same thing about it. */
  PV.changelogFault = function (note) {
    var s = PV.changelogTidy(note);
    if (!s) return 'empty';
    if (/[<>]/.test(s)) return 'no < or > — the file is Markdown and the modal is HTML';
    if (!/[.!?]$/.test(s)) return 'end it with . ! or ?';
    return null;
  };

  function quote(s) {
    return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }

  /* The array above, re-emitted in the layout it is written in. The editor
   * uses this to write the file back; test/changelog-test.js splices the
   * result over the real file and fails if a byte moved, which is what makes a
   * save from the GUI produce no incidental diff. */
  PV.changelogEntriesJs = function (entries) {
    return '[\n' + entriesOf(entries).map(function (rel) {
      return '    {\n' +
        '      version: ' + quote(rel.version) + ',\n' +
        '      date: ' + quote(rel.date) + ',\n' +
        '      notes: [\n' +
        rel.notes.map(function (n) { return '        ' + quote(n); }).join(',\n') + '\n' +
        '      ]\n' +
        '    }';
    }).join(',\n') + '\n  ]';
  };

  /* Everything but the array is left exactly as it was found — this file's
   * header comment and the functions below it included, which is why the
   * editor splices rather than regenerating the whole thing. */
  var ARRAY_RE = /(PV\.CHANGELOG = )\[[\s\S]*?\n  \];/;

  PV.changelogSource = function (fileText, entries) {
    if (!ARRAY_RE.test(fileText)) return null;
    return fileText.replace(ARRAY_RE, function (whole, head) {
      return head + PV.changelogEntriesJs(entries) + ';';
    });
  };

})(window.PV);
