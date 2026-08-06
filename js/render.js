/* render.js — draws the board. A hidden layer is genuinely not drawn, rather
 * than drawn in black, so nothing can leak through the darkness. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var TILE = PV.TILE;

  var PAC_YELLOW = '#ffd23f';

  /* The ping is one flat colour for every layer. Reading as a sweep rather
   * than as the board is the whole point, so nothing here uses a layer's own
   * palette. */
  var SCAN = '#5cffb0';
  var SCAN_EDGE = '#d8fff0';   // the leading edge, so the ring reads as a ring
  var EDGE_TIME = 0.1;         // how long an element counts as just-reached
  var FRONT_ALPHA = 0.22;      // the wavefront: present, never competing

  var TORCH_R = 46;            // 2.3 tiles
  var TORCH_SOFT = 12;         // px over which a ghost fades in at the rim

  var calmQuery = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)');

  /** True when the player has asked for less movement. */
  PV.wantsCalm = function () { return !!(calmQuery && calmQuery.matches); };

  /* Two summed sines, so the flicker never settles into an obvious beat. */
  function torchRadius(time) {
    if (PV.wantsCalm()) return TORCH_R;
    return TORCH_R * (1 + 0.045 * Math.sin(time * 11.3) + 0.028 * Math.sin(time * 23.7));
  }

  PV.createRenderer = function (canvas) {
    var ctx = canvas.getContext('2d');
    var scale = 1;   // backing-store pixels per design pixel

    var renderer = {
      shake: 0,

      kick: function (amount) { renderer.shake = Math.max(renderer.shake, amount); },

      setScale: function (s) { scale = s; },

      /* Paints the raw backing store, so it deliberately ignores the scale. */
      clear: function () {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      },

      draw: function (game, dt) {
        // visibleAlpha(), not vision.alpha: a death forces ghosts + Pac-Man on.
        var alpha = game.visibleAlpha();
        // Non-zero only in Torch, where it doubles as the mode test.
        var torchR = game.rules.style === 'torch' ? torchRadius(game.time) : 0;

        ctx.save();
        // Everything below is authored in the fixed 560x620 design space; this
        // maps it onto the real canvas size so the board stays sharp.
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, PV.WIDTH, PV.HEIGHT);

        if (renderer.shake > 0) {
          var s = renderer.shake;
          ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
          renderer.shake = Math.max(0, renderer.shake - dt * 26);
        }

        // Under the layers, so a death reveal still draws over the top.
        if (torchR) {
          drawPulse(ctx, game);
          drawTorch(ctx, game, torchR, scale);
        }

        // Only drawWalls needs `scale` — see its shadowBlur.
        if (alpha.walls > 0)  drawWalls(ctx, game.maze, alpha.walls, scale);
        if (alpha.dots > 0)   drawPellets(ctx, game.maze, alpha.dots, game.time);
        drawGhosts(ctx, game, alpha.ghosts, torchR);
        if (alpha.pacman > 0) drawPacman(ctx, game, alpha.pacman);

        drawFloatingScores(ctx, game);
        ctx.restore();
      }
    };

    return renderer;
  };

  function fillCircle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWalls(ctx, maze, alpha, scale) {
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = 'rgba(24,36,102,0.45)';
    for (var r = 0; r < maze.rows; r++) {
      for (var c = 0; c < maze.cols; c++) {
        if (maze.walls[r][c]) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }

    ctx.strokeStyle = '#4b6bff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(75,107,255,0.85)';
    ctx.shadowBlur = 6 * alpha * scale;   // in device pixels, so scale by hand
    ctx.beginPath();
    var segs = maze.edges;
    for (var i = 0; i < segs.length; i++) {
      ctx.moveTo(segs[i][0], segs[i][1]);
      ctx.lineTo(segs[i][2], segs[i][3]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawHouseDoors(ctx, maze);
    ctx.restore();
  }

  function drawHouseDoors(ctx, maze) {
    ctx.strokeStyle = '#ff9ede';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (var r = 0; r < maze.rows; r++) {
      for (var c = 0; c < maze.cols; c++) {
        if (!maze.doors[r][c]) continue;
        ctx.moveTo(c * TILE, r * TILE + TILE / 2);
        ctx.lineTo(c * TILE + TILE, r * TILE + TILE / 2);
      }
    }
    ctx.stroke();
  }

  /* The ping. Each element's distance from the frozen origin decides both how
   * bright it is and whether the ring has reached it at all. */
  function drawPulse(ctx, game) {
    var p = game.vision.pulse();
    if (!p) return;

    ctx.save();
    // Under the layer, so it never sits over a contact.
    drawPulseFront(ctx, p);
    if (p.layer === 'walls') drawPulseWalls(ctx, game.maze, p, game.rules);
    else if (p.layer === 'dots') drawPulseDots(ctx, game.maze, p, game.rules);
    else if (p.layer === 'ghosts') drawPulseBlips(ctx, p, game.rules);
    ctx.restore();
  }

  /* The wavefront itself. A walls or dots ping shows where the ring is for
   * free, as things light up; a ghosts ping has nothing to light between
   * contacts and reads as if the press did nothing. This gives every layer the
   * same running commentary, and weakens as it spreads. */
  function drawPulseFront(ctx, p) {
    var reach = p.age * PV.PULSE_SPEED;
    var spent = reach / PV.PULSE_SPAN;
    if (spent >= 1) return;   // off the board; nothing left to show

    ctx.globalAlpha = FRONT_ALPHA * (1 - spent);
    ctx.strokeStyle = SCAN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, reach, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** True while an element is close enough behind the ring to read as its edge. */
  function justReached(dist, age) {
    return age - dist / PV.PULSE_SPEED < EDGE_TIME;
  }

  function drawPulseWalls(ctx, maze, p, rules) {
    var segs = maze.edges;   // already one segment per tile face
    ctx.lineCap = 'round';
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var d = Math.hypot((s[0] + s[2]) / 2 - p.x, (s[1] + s[3]) / 2 - p.y);
      var a = PV.pulseAlpha(d, p.age, rules);
      if (a <= 0.001) continue;
      var edge = justReached(d, p.age);
      ctx.globalAlpha = a;
      ctx.strokeStyle = edge ? SCAN_EDGE : SCAN;
      ctx.lineWidth = edge ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(s[0], s[1]);
      ctx.lineTo(s[2], s[3]);
      ctx.stroke();
    }
  }

  function drawPulseDots(ctx, maze, p, rules) {
    for (var r = 0; r < maze.rows; r++) {
      for (var c = 0; c < maze.cols; c++) {
        if (!maze.pellets[r][c]) continue;   // an eaten dot simply isn't there
        var x = PV.center(c), y = PV.center(r);
        var d = Math.hypot(x - p.x, y - p.y);
        var a = PV.pulseAlpha(d, p.age, rules);
        if (a <= 0.001) continue;
        var edge = justReached(d, p.age);
        ctx.globalAlpha = a;
        ctx.fillStyle = edge ? SCAN_EDGE : SCAN;
        fillCircle(ctx, x, y, edge ? 2.6 : 1.8);
      }
    }
  }

  /* A contact is the ghost's own outline, so there is no doubt what the ring
   * found. The wobble is frozen with the position — a sampled contact should
   * not keep animating. blips is sparse, indexed by ghost, and forEach skips
   * the holes. */
  function drawPulseBlips(ctx, p, rules) {
    p.blips.forEach(function (b) {
      var d = Math.hypot(b.x - p.x, b.y - p.y);
      var a = PV.pulseAlpha(d, p.age, rules);
      if (a <= 0.001) return;
      var edge = justReached(d, p.age);

      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(b.x, b.y);
      ctx.strokeStyle = edge ? SCAN_EDGE : SCAN;
      ctx.lineWidth = edge ? 2.5 : 1.5;
      ctx.lineJoin = 'round';
      ghostBodyPath(ctx, TILE * 0.46, b.wobble);
      ctx.stroke();
      ctx.restore();
    });
  }

  /* The torch: a disc of real colour around Pac-Man in a mode that is
   * otherwise black. Ghosts are not clipped — drawGhosts gives them an alpha
   * floor instead, so one straddling the rim shows whole rather than sliced.
   * Pac-Man himself is drawn by the freeSelf path. */
  function drawTorch(ctx, game, radius, scale) {
    var p = game.pacman;

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.clip();
    drawWalls(ctx, game.maze, 1, scale);
    drawPellets(ctx, game.maze, 1, game.time);
    ctx.restore();

    // A warm halo on the rim, so the hard clip edge reads as light falling off.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,130,0.45)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255,196,92,0.9)';
    ctx.shadowBlur = 10 * scale;   // in device pixels, so scale by hand
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* Same shape as PV.ghostReveal: a per-entity alpha floor, not a clip. */
  function torchReveal(g, pacman, radius) {
    if (!radius) return 0;
    var d = Math.hypot(g.x - pacman.x, g.y - pacman.y);
    if (d <= radius - TORCH_SOFT) return 1;
    if (d >= radius) return 0;
    return (radius - d) / TORCH_SOFT;
  }

  function drawPellets(ctx, maze, alpha, time) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffe9a8';

    for (var r = 0; r < maze.rows; r++) {
      for (var c = 0; c < maze.cols; c++) {
        var kind = maze.pellets[r][c];
        if (!kind) continue;
        var x = PV.center(c), y = PV.center(r);
        if (kind === 1) {
          ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        } else {
          fillCircle(ctx, x, y, 4 + Math.sin(time * 6) * 1.6);   // power pellet
        }
      }
    }
    ctx.restore();
  }

  function drawGhosts(ctx, game, alpha, torchR) {
    var dying = game.state === 'dying';
    var rad = TILE * 0.46;

    game.ghosts.forEach(function (g) {
      // A ghost in the house shows through even with the layer dark — except
      // in Torch, which brings its own light and so opts out: what is waiting
      // in the house is something you walk up to or ping for.
      var housed = torchR ? 0 : PV.ghostReveal(g);
      var a = Math.max(alpha, housed, torchReveal(g, game.pacman, torchR));
      if (a <= 0.001) return;

      var eyesOnly = g.state === 'eaten' || g.state === 'entering';
      var isCulprit = dying && game.killer === g;
      var body = g.color;

      if (g.frightened && !eyesOnly) {
        // flash white over the last two seconds of the power pellet
        var ending = game.frightTimer < 2 && Math.floor(game.frightTimer * 6) % 2 === 0;
        body = ending ? '#ffffff' : '#2b4bff';
      }

      ctx.save();
      // fade the bystanders during a death so the culprit stands out
      ctx.globalAlpha = dying && !isCulprit ? a * 0.35 : a;
      ctx.translate(g.x, g.y);

      if (isCulprit) drawCulpritRing(ctx, game.stateTime, rad);
      if (!eyesOnly) drawGhostBody(ctx, body, rad, g.wobble);
      drawGhostEyes(ctx, g, body, rad, eyesOnly);

      ctx.restore();
    });
  }

  /* The dome-and-skirt silhouette, in the ghost's local space. Left as a bare
   * path so callers can fill it as a body or stroke it as a sonar contact,
   * which keeps the two from drifting apart. */
  function ghostBodyPath(ctx, rad, wobble) {
    ctx.beginPath();
    ctx.arc(0, -rad * 0.15, rad, Math.PI, 0);           // domed head
    ctx.lineTo(rad, rad * 0.7);

    var feet = 3, w = (rad * 2) / feet;                 // wavy skirt
    for (var i = 0; i < feet; i++) {
      var x0 = rad - i * w;
      var dip = (i + Math.floor(wobble)) % 2 === 0 ? rad * 0.28 : rad * 0.05;
      ctx.quadraticCurveTo(x0 - w * 0.5, rad * 0.7 + dip, x0 - w, rad * 0.7);
    }
    ctx.closePath();
  }

  function drawGhostBody(ctx, color, rad, wobble) {
    ghostBodyPath(ctx, rad, wobble);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawGhostEyes(ctx, g, body, rad, eyesOnly) {
    if (g.frightened && !eyesOnly) {
      ctx.fillStyle = body === '#ffffff' ? '#ff3c3c' : '#ffd6f2';
      fillCircle(ctx, -rad * 0.32, -rad * 0.2, rad * 0.16);
      fillCircle(ctx, rad * 0.32, -rad * 0.2, rad * 0.16);
      return;
    }

    var ex = g.dir.x * rad * 0.22, ey = g.dir.y * rad * 0.22;   // pupils lead the way
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-rad * 0.34, -rad * 0.22, rad * 0.26, rad * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(rad * 0.34, -rad * 0.22, rad * 0.26, rad * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a2acc';
    fillCircle(ctx, -rad * 0.34 + ex, -rad * 0.22 + ey, rad * 0.14);
    fillCircle(ctx, rad * 0.34 + ex, -rad * 0.22 + ey, rad * 0.14);
  }

  /* Snaps outward from the ghost that caught you, then pulses. Drawn in the
   * ghost's local space so it tracks whatever it is around. */
  function drawCulpritRing(ctx, stateTime, rad) {
    var ease = 1 - Math.pow(1 - Math.min(1, stateTime / 0.18), 3);
    var pulse = 0.5 + 0.5 * Math.sin(stateTime * 14);
    var radius = rad * (0.9 + ease * 0.95 + pulse * 0.12);

    ctx.save();
    ctx.globalAlpha = 0.30 + 0.45 * pulse;
    ctx.strokeStyle = '#ff4d6d';
    ctx.lineWidth = 2 + pulse * 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // soft halo so it reads even against a black board
    ctx.globalAlpha = 0.14 * ease;
    ctx.fillStyle = '#ff4d6d';
    fillCircle(ctx, 0, 0, radius);
    ctx.restore();
  }

  function drawPacman(ctx, game, alpha) {
    var p = game.pacman;
    var rad = TILE * 0.48;
    var mouth, fill;

    if (game.state === 'dying') {
      // Hold intact through the reveal beat so the collision is visible, then
      // the mouth opens all the way around and he fades out.
      var t = Math.min(1, Math.max(0, (game.stateTime - PV.DEATH_REVEAL) / PV.DEATH_ANIM));
      mouth = t * Math.PI;
      alpha *= 1 - t * 0.9;
      fill = PAC_YELLOW;
    } else {
      mouth = p.blocked ? 0.05 * Math.PI : (Math.sin(p.mouth) * 0.5 + 0.5) * 0.32 * Math.PI;
      fill = game.invuln > 0 && Math.floor(game.time * 12) % 2 === 0
        ? 'rgba(255,210,63,0.35)' : PAC_YELLOW;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.dir.y, p.dir.x));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, rad, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFloatingScores(ctx, game) {
    if (!game.pops.length) return;
    ctx.save();
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    game.pops.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - p.age * 22);
    });
    ctx.restore();
  }

})(window.PV);
