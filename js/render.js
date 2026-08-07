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
  var FRONT_ALPHA = 0.70;      // the wavefront: present, never competing

  var TORCH_SOFT = 12;                 // px over which an edge fades in

  PV.TORCH_SOFT = TORCH_SOFT;

  var calmQuery = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)');

  /** True when the player has asked for less movement. */
  PV.wantsCalm = function () { return !!(calmQuery && calmQuery.matches); };

  /* Two summed sines, so the flicker never settles into an obvious beat. */
  function torchRadius(base, time) {
    if (PV.wantsCalm()) return base;
    return base * (1 + 0.045 * Math.sin(time * 11.3) + 0.028 * Math.sin(time * 23.7));
  }

  /**
   * Line-of-sight against the wall grid: true if nothing solid sits between
   * the two points. Walks every tile the segment actually passes through
   * (Amanatides-Woo grid traversal), rather than sampling points along it —
   * a fixed sampling interval can step clean over a wall it clips only at a
   * corner, however fine the interval; walking tile-by-tile can't skip one.
   * A segment that passes exactly through a lattice corner checks both
   * corner-adjacent tiles before stepping diagonally, so a grazing corner
   * can't slip past unresolved. The tie test itself uses an epsilon: after
   * enough accumulated additions, two crossings meant to land at the same
   * spot drift a float apart, and a strict === would silently fall back to
   * a single-axis step that walks past the one tile actually holding the
   * corner. Origin and destination tiles are never tested — a caller
   * checking visibility of a wall tile's own face passes that wall's *open*
   * neighbour as the destination, not the wall tile itself; testing the
   * endpoints would make a target inside or beside a wall spuriously block
   * itself.
   */
  PV.canSee = function (x0, y0, x1, y1, maze) {
    var TIE_EPS = 1e-9;   // in the segment's own 0..1 span — see comment above

    var c = Math.floor(x0 / TILE), r = Math.floor(y0 / TILE);
    var c1 = Math.floor(x1 / TILE), r1 = Math.floor(y1 / TILE);
    var dx = x1 - x0, dy = y1 - y0;

    var stepC = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    var stepR = dy > 0 ? 1 : dy < 0 ? -1 : 0;

    // How far (in the segment's own 0..1 span) to the next column/row line,
    // and how much of that span one tile's width/height costs.
    var tMaxC = stepC === 0 ? Infinity : ((stepC > 0 ? (c + 1) * TILE : c * TILE) - x0) / dx;
    var tMaxR = stepR === 0 ? Infinity : ((stepR > 0 ? (r + 1) * TILE : r * TILE) - y0) / dy;
    var tDeltaC = stepC === 0 ? Infinity : Math.abs(TILE / dx);
    var tDeltaR = stepR === 0 ? Infinity : Math.abs(TILE / dy);

    while (c !== c1 || r !== r1) {
      if (tMaxC < tMaxR - TIE_EPS) {
        c += stepC; tMaxC += tDeltaC;
      } else if (tMaxR < tMaxC - TIE_EPS) {
        r += stepR; tMaxR += tDeltaR;
      } else {
        // Exactly through a corner — either neighbour blocks the view.
        if (maze.isWall(c + stepC, r)) return false;
        if (maze.isWall(c, r + stepR)) return false;
        c += stepC; r += stepR; tMaxC += tDeltaC; tMaxR += tDeltaR;
      }
      if (c === c1 && r === r1) break;   // destination tile is never tested
      if (maze.isWall(c, r)) return false;
    }
    return true;
  };

  /**
   * How lit a point at offset (dx, dy) from Blinkman is, before occlusion —
   * the union of the fixed circle and the forward cone, each with a soft
   * TORCH_SOFT-px edge. `dir` is one of PV.DIRS (a unit vector); `params` is
   * {radius, coneLen, coneHalf, soft}. Independent of occlusion on purpose:
   * callers AND this with PV.canSee once they know what they're looking at.
   */
  PV.torchAlpha = function (dx, dy, dir, params) {
    var dist = Math.hypot(dx, dy);
    var soft = params.soft;

    var circleA = 0;
    if (dist <= params.radius) {
      circleA = dist <= params.radius - soft ? 1 : (params.radius - dist) / soft;
    }

    var coneA = 0;
    if (dist > 0 && dist <= params.coneLen) {
      var cosTheta = Math.max(-1, Math.min(1, (dx * dir.x + dy * dir.y) / dist));
      var theta = Math.acos(cosTheta);
      if (theta <= params.coneHalf) {
        var radialEdge = params.coneLen - dist;
        var sideEdge = (params.coneHalf - theta) * dist;   // arc length, in px
        var edge = Math.min(radialEdge, sideEdge);
        coneA = edge >= soft ? 1 : edge / soft;
      }
    }

    return Math.max(circleA, coneA);
  };

  PV.createRenderer = function (canvas) {
    var ctx = canvas.getContext('2d');
    var scale = 1;   // backing-store pixels per design pixel

    /* What the torch carries between frames so it can ease instead of snap:
     * the heading it is swinging toward, the last ray lengths, and where it
     * stood when it measured them. Null until the first Torch frame. */
    var torchMemory = { facing: null, reach: null, x: 0, y: 0 };

    var aura = PV.createAura();

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
        // Non-null only in Torch, where it doubles as the mode test.
        var torch = null, reach = null;
        if (game.rules.mode === 'torch') {
          var r = torchRadius(game.rules.torchRadius, game.time);
          torch = {
            x: game.pacman.x, y: game.pacman.y,
            radius: r,
            // flickers in step with the circle
            coneLen: game.rules.coneLen * (r / game.rules.torchRadius),
            coneHalf: game.rules.coneHalf,
            soft: TORCH_SOFT
          };
          // The swung heading, not his own: the beam lags a turn by a frame
          // or two, and what it lights has to agree with where it points.
          torch.dir = torchSwing(torchMemory, game.pacman.dir, torch.x, torch.y, dt);
          reach = PV.torchEase(torchMemory, torch, game.maze, dt);
        }

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
        if (torch) {
          drawPulse(ctx, game);
          drawTorch(ctx, game, torch, reach, scale);
        }

        // Only drawWalls needs `scale` — see its shadowBlur.
        if (alpha.walls > 0)  drawWalls(ctx, game.maze, alpha.walls, scale);
        if (alpha.dots > 0)   drawPellets(ctx, game.maze, alpha.dots, game.time);
        // The whole layer set, not just alpha.ghosts: the house reveal reads
        // the board layers too.
        drawGhosts(ctx, game, alpha, torch);
        if (alpha.pacman > 0) drawPacman(ctx, game, alpha.pacman);

        drawFloatingScores(ctx, game);
        ctx.restore();
      },

      /* Asked for separately from the board, which the demo behind the menu is
       * drawn with too: the aura reports the round the player is in. Its own
       * transform, outside draw()'s shake — a band pinned to the board's edge
       * must not slide off it. */
      drawAura: function (game, dt) {
        aura.update(game, dt);
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        aura.draw(ctx);
        ctx.restore();
      },

      resetAura: function () { aura.reset(); }
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
    var pulses = game.vision.pulses();
    if (!pulses.length) return;

    ctx.save();
    pulses.forEach(function (p) {
      // Under the layer, so it never sits over a contact.
      drawPulseFront(ctx, p);
      if (p.layer === 'walls') drawPulseWalls(ctx, game.maze, p, game.rules);
      else if (p.layer === 'dots') drawPulseDots(ctx, game.maze, p, game.rules);
      else if (p.layer === 'ghosts') drawPulseBlips(ctx, p, game.rules);
    });
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

  /* How bright a contact of ping `p` draws, and whether it reads as the ring's
   * leading edge. Both come off `b.dist` — where the ring found it — rather
   * than off the distance it sits at now, so a contact that has followed its
   * ghost keeps fading on the schedule it was found on instead of relighting
   * when the ring catches up with its new position. */
  PV.blipDraw = function (b, p, rules) {
    return {
      alpha: PV.pulseAlpha(b.dist, p.age, rules),
      edge: justReached(b.dist, p.age)
    };
  };

  /* A contact is the ghost's own outline, so there is no doubt what the ring
   * found. blips is sparse, indexed by ghost, and forEach skips the holes. */
  function drawPulseBlips(ctx, p, rules) {
    p.blips.forEach(function (b) {
      var d = PV.blipDraw(b, p, rules);
      if (d.alpha <= 0.001) return;

      ctx.save();
      ctx.globalAlpha = d.alpha;
      ctx.translate(b.x, b.y);
      ctx.strokeStyle = d.edge ? SCAN_EDGE : SCAN;
      ctx.lineWidth = d.edge ? 2.5 : 1.5;
      ctx.lineJoin = 'round';
      ghostBodyPath(ctx, TILE * 0.46, b.wobble);
      ctx.stroke();
      ctx.restore();
    });
  }

  var TORCH_RAYS = 480;          // ~0.75 deg apart: smooth at the cone's reach
  var TORCH_BITE = TILE * 0.5;   // how far light sinks into the wall it stops on
  var TORCH_SPILL = 700;         // px/s the lit edge travels when a way opens
  var TORCH_TURN = 20;           // rad/s the beam swings round to a new heading
  var TORCH_JUMP = TILE * 2;     // a move this big (the tunnel) skips the easing
  var TORCH_RIM = 'rgba(255,214,130,0.20)';

  /** An angle folded into a single turn, 0 to 2pi. */
  function wrapTurn(a) {
    var t = Math.PI * 2;
    return ((a % t) + t) % t;
  }

  /** The same angle folded to -pi..pi, so its sign is a direction to turn. */
  function wrapHalf(a) {
    var t = Math.PI * 2, w = wrapTurn(a);
    return w > Math.PI ? w - t : w;
  }

  /** Move `from` toward `to` by at most `step`. */
  function approach(from, to, step) {
    var d = to - from;
    return Math.abs(d) <= step ? to : from + (d > 0 ? step : -step);
  }

  /* How far the light reaches at this absolute angle: the cone's length
   * within the cone, the disc's radius everywhere else. Their union is the
   * lit shape before any wall gets in the way. A torch with no cone is the
   * disc alone — without the first line an exactly-forward ray matches
   * `coneHalf: 0` and reports a reach of zero, notching the lit shape. */
  function torchReach(ang, torch) {
    if (torch.coneLen <= 0) return torch.radius;
    var off = ang - Math.atan2(torch.dir.y, torch.dir.x);
    while (off > Math.PI) off -= Math.PI * 2;
    while (off < -Math.PI) off += Math.PI * 2;
    return Math.abs(off) <= torch.coneHalf ? torch.coneLen : torch.radius;
  }

  /* Distance to the first wall along a ray, capped at `max`. Walks the grid
   * the way PV.canSee does, but reports where it stopped rather than whether
   * it arrived. Light sinks TORCH_BITE into the wall it lands on, so a wall
   * reads as a lit surface instead of a bare outline — half a tile, so it
   * can never reach through to the corridor on the far side. */
  function torchRay(x0, y0, ang, max, maze) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var c = Math.floor(x0 / TILE), r = Math.floor(y0 / TILE);

    var stepC = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    var stepR = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    var tMaxC = stepC === 0 ? Infinity : ((stepC > 0 ? (c + 1) * TILE : c * TILE) - x0) / dx;
    var tMaxR = stepR === 0 ? Infinity : ((stepR > 0 ? (r + 1) * TILE : r * TILE) - y0) / dy;
    var tDeltaC = stepC === 0 ? Infinity : Math.abs(TILE / dx);
    var tDeltaR = stepR === 0 ? Infinity : Math.abs(TILE / dy);

    for (var guard = 0; guard < 64; guard++) {
      var t;
      if (tMaxC < tMaxR) { t = tMaxC; c += stepC; tMaxC += tDeltaC; }
      else { t = tMaxR; r += stepR; tMaxR += tDeltaR; }
      if (t >= max) return max;
      if (maze.isWall(c, r)) return Math.min(t + TORCH_BITE, max);
    }
    return max;
  }

  /* Where the beam is pointing, as a unit vector. It swings round to a new
   * heading rather than cutting to it, so a turn reads as a turn. A reversal
   * is a tie — both ways round are the same distance — and breaks toward
   * whichever sweep crosses the middle of the board, which is the side with
   * more to look at. Everything downstream reads this rather than his own
   * facing, so the ghosts a beam lights are the ones it visibly covers. */
  function torchSwing(mem, dir, x, y, dt) {
    if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
    var want = Math.atan2(dir.y, dir.x);

    if (mem.facing === null) {
      mem.facing = want;
    } else {
      var d = wrapHalf(want - mem.facing);
      if (Math.PI - Math.abs(d) < 1e-3) {
        var toMiddle = Math.atan2(PV.HEIGHT / 2 - y, PV.WIDTH / 2 - x);
        d = wrapHalf(toMiddle - mem.facing) >= 0 ? Math.PI : -Math.PI;
      }
      mem.facing = wrapTurn(approach(mem.facing, mem.facing + d, TORCH_TURN * dt));
    }
    return { x: Math.cos(mem.facing), y: Math.sin(mem.facing) };
  }

  /* The furthest the light can go in any direction: the cone where there is
   * one, the disc otherwise. Capping at the cone alone collapses a coneless
   * torch to nothing. */
  function torchFar(torch) {
    return Math.max(torch.coneLen, torch.radius);
  }

  /* Each ray's length, eased from where it was last frame. Easing is what
   * keeps a corridor from arriving all at once the instant he clears a
   * corner — the light runs down it instead.
   *
   * Two lengths per ray, and the difference between them is the whole of it.
   * `want` is how far the lit shape asks to reach at this angle; `wall` is how
   * far the walls actually allow, and is never the shorter of the two. A ray
   * still running out sits past `want` and below `wall` — that is the corridor
   * arriving — so `wall`, not `want`, is what it is held to. Holding it to
   * `want` would snap every trailing ray home in a frame; dropping the clamp
   * altogether would leave a lagging ray inside a wall he has just walked up
   * to, showing light through it.
   *
   * `cut` skips the easing where there is nothing to ease: a mem carrying no
   * rays yet, so the first frame is the bare shape, and a jump too big to be a
   * step (the tunnel), which would otherwise sweep the light across the
   * board. */
  PV.torchEase = function (mem, torch, maze, dt) {
    var reach = mem.reach;
    var cut = reach === null || Math.hypot(torch.x - mem.x, torch.y - mem.y) > TORCH_JUMP;
    if (reach === null) reach = mem.reach = new Array(TORCH_RAYS);

    var far = torchFar(torch);
    var step = TORCH_SPILL * dt;
    for (var i = 0; i < TORCH_RAYS; i++) {
      var ang = i / TORCH_RAYS * Math.PI * 2;
      var wall = torchRay(torch.x, torch.y, ang, far, maze);
      var want = Math.min(torchReach(ang, torch), wall);
      reach[i] = Math.min(cut ? want : approach(reach[i], want, step), wall);
    }

    mem.x = torch.x;
    mem.y = torch.y;
    return reach;
  };

  /* The lit region as one polygon. Used as a clip, so the board inside draws
   * exactly as it would anywhere else and the darkness is the absence of it
   * — no per-tile lighting, nothing to read as a grid. */
  function torchClipPath(ctx, torch, reach) {
    ctx.beginPath();
    for (var i = 0; i < TORCH_RAYS; i++) {
      var ang = i / TORCH_RAYS * Math.PI * 2;
      var x = torch.x + Math.cos(ang) * reach[i];
      var y = torch.y + Math.sin(ang) * reach[i];
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /* The torch: the board itself, shown only where the light lands. Ghosts
   * are not clipped — drawGhosts gives them an alpha floor instead, so one
   * straddling the edge shows whole rather than sliced. */
  function drawTorch(ctx, game, torch, reach, scale) {
    ctx.save();
    torchClipPath(ctx, torch, reach);
    ctx.clip();
    drawWalls(ctx, game.maze, 1, scale);
    drawPellets(ctx, game.maze, 1, game.time);
    ctx.restore();

    // A faint rim on the lit edge. Down a bare corridor there is no wall
    // close enough to catch the light, and without this the dark just
    // thins out with nothing to say how far you can actually see.
    ctx.save();
    torchClipPath(ctx, torch, reach);
    ctx.strokeStyle = TORCH_RIM;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
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

  /* Same shape as torchTileLit, but against the ghost's exact float position
   * rather than a tile centre — a ghost fading in mid-tile shouldn't snap. */
  function torchGhostAlpha(g, maze, torch) {
    var dx = g.x - torch.x, dy = g.y - torch.y;
    var a = PV.torchAlpha(dx, dy, torch.dir, torch);
    if (a <= 0) return 0;
    return PV.canSee(torch.x, torch.y, g.x, g.y, maze) ? a : 0;
  }

  /* How solid a ghost draws: the brightest of the ghosts layer, whatever the
   * torch is putting on it, and the house reveal scaled by how lit the board
   * around it is — so who is still waiting shows while the board is up and
   * goes out with it, rather than glowing through a board the player has let
   * go dark. The board is the dots and walls: a lit ghosts layer draws them in
   * full anyway, and `pacman` is only him. `torch` is null outside torch mode,
   * which lights no layer of its own once a round is under way, leaving the
   * beam the whole of the decision there. */
  PV.ghostDrawAlpha = function (g, alpha, torch, maze) {
    var ambient = Math.max(alpha.dots, alpha.walls);
    return Math.max(alpha.ghosts, PV.ghostReveal(g) * ambient,
      torch ? torchGhostAlpha(g, maze, torch) : 0);
  };

  function drawGhosts(ctx, game, alpha, torch) {
    var dying = game.state === 'dying';
    var rad = TILE * 0.46;

    game.ghosts.forEach(function (g) {
      var a = PV.ghostDrawAlpha(g, alpha, torch, game.maze);
      if (a <= 0.001) return;

      var eyesOnly = g.state === 'eaten' || g.state === 'entering';
      var isCulprit = dying && game.killer === g;
      var body = g.color;

      if (g.frightened && !eyesOnly) {
        // flash white over the closing stretch of the power pellet
        var ending = game.frightTimer < PV.FRIGHT_ENDING && Math.floor(game.frightTimer * 6) % 2 === 0;
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
