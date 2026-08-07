/* menu.js — the mode and difficulty picker on the title screen.
 *
 * Two steps in one list. The mode rows hold their place throughout: opening one
 * strips the other two to labels and takes every digit badge off the modes, so
 * 1/2/3 only ever address the list they are drawn on. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* The logo's eye in three states, drawn the same way as the mark in the h1 —
   * 24x24, stroke 1.9, round caps, colour inherited so CSS can tint them. */
  var ICONS = {
    stare:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<path d="M2.8 12C6.4 5.4 17.6 5.4 21.2 12"/>' +
      '<path d="M2.8 12C6.4 18.6 17.6 18.6 21.2 12"/>' +
      '<circle cx="12" cy="12" r="2.9" fill="currentColor" stroke="none"/></svg>',
    torch:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<path d="M1.4 12C4.2 7.4 10.6 7.4 13.4 12"/>' +
      '<path d="M1.4 12C4.2 16.6 10.6 16.6 13.4 12"/>' +
      '<circle cx="7.4" cy="12" r="1.6" fill="currentColor" stroke="none"/>' +
      '<path d="M15.33 6.24a9.8 9.8 0 0 1 0 11.52"/>' +
      '<path d="M19.26 6.21a13.2 13.2 0 0 1 0 11.58"/></svg>',
    flash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<path d="M3.4 12.8h17.2"/>' +
      '<path d="M3.4 12.8C7.4 18.8 16.6 18.8 20.6 12.8"/>' +
      '<path d="M7.6 10.4 5.5 6.9M12 10V6.2M16.4 10.4 18.5 6.9"/></svg>'
  };

  var MOVE = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 };
  var DIGIT = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };

  /**
   * @param root   the container the list is drawn into
   * @param onStart called with a cell id, e.g. 'torch-hard'
   */
  PV.createMenu = function (root, onStart) {
    var open = false;    // is a mode showing its difficulties
    var mode = 0;
    var level = 1;       // Normal

    function modeId() { return PV.MODE_IDS[mode]; }
    function cellId() { return modeId() + '-' + PV.LEVELS[level]; }

    /* `num` is omitted for rows the number keys do not address — a collapsed
     * mode, or the open one, which is a heading rather than a choice. */
    function row(o) {
      return '<button class="mrow' + (o.cls ? ' ' + o.cls : '') + '" type="button"' +
        ' tabindex="-1" data-act="' + o.act + '" data-i="' + o.i + '">' +
        (o.icon ? '<span class="mico">' + o.icon + '</span>' : '') +
        '<span class="mbody"><span class="mname">' + o.name + '</span>' +
        (o.desc ? '<span class="mdesc">' + o.desc + '</span>' : '') + '</span>' +
        (o.num ? '<span class="mnum">' + (o.i + 1) + '</span>' : '') +
        '</button>';
    }

    function levelRows() {
      var copy = PV.TEXT.modes[modeId()].levels;
      return '<div class="mlevels">' + PV.LEVELS.map(function (lv, i) {
        return row({
          act: 'level', i: i, name: PV.TEXT.levels[lv], desc: copy[lv].menu,
          num: true, cls: level === i ? 'is-cursor' : ''
        });
      }).join('') + '</div>';
    }

    function render() {
      root.innerHTML = PV.MODE_IDS.map(function (id, i) {
        var copy = PV.TEXT.modes[id];
        if (!open) {
          return row({
            act: 'mode', i: i, name: copy.name, desc: copy.menu, icon: ICONS[id],
            num: true, cls: mode === i ? 'is-cursor' : ''
          });
        }
        if (i === mode) {
          return row({
            act: 'mode', i: i, name: copy.name, desc: copy.menu,
            icon: ICONS[id], cls: 'is-open'
          }) + levelRows();
        }
        return row({ act: 'mode', i: i, name: copy.name, icon: ICONS[id], cls: 'is-collapsed' });
      }).join('');
    }

    var menu = {
      /** Back to the mode list, cursor on Stare · Normal. */
      reset: function () {
        open = false;
        mode = 0;
        level = 1;
        render();
      },

      /** @returns true if the key was the menu's to handle */
      handleKey: function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;

        if (MOVE[e.code] !== undefined) {
          if (open) level = (level + MOVE[e.code] + 3) % 3;
          else mode = (mode + MOVE[e.code] + 3) % 3;
          render();
          return true;
        }

        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { menu.back(); return true; }
        if (e.code === 'ArrowRight' || e.code === 'KeyD' ||
            e.code === 'Enter' || e.code === 'Space') {
          menu.take(null);
          return true;
        }
        if (e.code === 'Escape') { menu.back(); return true; }

        if (DIGIT[e.code] !== undefined) { menu.take(DIGIT[e.code]); return true; }
        return false;
      },

      /** Take the row under the cursor, or the numbered one. */
      take: function (i) {
        if (open) {
          if (i !== null) level = i;
          onStart(cellId());
        } else {
          if (i !== null) mode = i;
          open = true;
          render();
        }
      },

      back: function () {
        if (!open) return;
        open = false;
        render();
      }
    };

    /* Clicking a collapsed mode opens it instead — the change-of-mind path —
     * and clicking the open one folds it back up. */
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.mrow');
      if (!btn) return;
      var i = Number(btn.dataset.i);
      if (btn.dataset.act === 'level') { level = i; onStart(cellId()); return; }
      if (open && i === mode) { menu.back(); return; }
      mode = i;
      open = true;
      render();
    });

    /* Hover and the keyboard share one cursor, so there is a single "here" on
     * screen. Mode rows are exempt while a mode is open: the cursor belongs to
     * the difficulties then, and sliding past a collapsed label must not drag
     * it out of the list 1/2/3 address. */
    root.addEventListener('mouseover', function (e) {
      var btn = e.target.closest('.mrow');
      if (!btn) return;
      var i = Number(btn.dataset.i);
      if (btn.dataset.act === 'level') { level = i; render(); return; }
      if (open) return;
      mode = i;
      render();
    });

    menu.reset();
    return menu;
  };

})(window.PV);
