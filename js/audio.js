/* audio.js — every sound is synthesised, so there are no asset files to load. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var VOLUME = 0.5;

  var ctx = null;
  var master = null;
  var muted = false;
  var chompFlip = 0;      // alternates the two "waka" pitches
  var siren = null;       // { osc, lfo } while a round is running

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(ctx.destination);
    return ctx;
  }

  // Browsers hold the context suspended until a real gesture happens.
  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /** One oscillator with an attack/decay envelope. */
  function tone(opts) {
    if (!ensure() || muted) return;
    var t0 = ctx.currentTime + (opts.delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to && opts.to !== opts.from) {
      // exponentialRamp throws on a non-positive target, so fall back to linear
      if (opts.to > 0 && opts.from > 0) {
        osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
      } else {
        osc.frequency.linearRampToValueAtTime(opts.to, t0 + opts.dur);
      }
    }
    var peak = opts.gain == null ? 0.22 : opts.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.03);
  }

  /** A run of notes `step` apart. `bend` scales each note's end pitch (1 = flat). */
  function arp(freqs, opts) {
    freqs.forEach(function (f, i) {
      tone({ type: opts.type, from: f, to: f * (opts.bend || 1),
             dur: opts.dur, gain: opts.gain, delay: i * opts.step });
    });
  }

  /** A burst of filtered white noise — used for thuds and whooshes. */
  function noise(opts) {
    if (!ensure() || muted) return;
    var t0 = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur;
    var frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = opts.filter || 'lowpass';
    filt.frequency.setValueAtTime(opts.from, t0);
    if (opts.to) filt.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    filt.Q.value = opts.q || 1;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.gain == null ? 0.3 : opts.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filt).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  PV.Sfx = {
    unlock: unlock,

    isMuted: function () { return muted; },

    setMuted: function (m) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : VOLUME;
      if (muted) PV.Sfx.stopSiren();
    },

    chomp: function () {
      chompFlip ^= 1;
      var pitch = chompFlip ? 420 : 340;
      tone({ type: 'square', from: pitch, to: pitch * 0.55, dur: 0.075, gain: 0.14 });
    },

    power: function () {
      arp([220, 330, 440, 660], { type: 'sawtooth', bend: 1.5, dur: 0.12, gain: 0.16, step: 0.055 });
    },

    bump: function () {
      tone({ type: 'sine', from: 150, to: 48, dur: 0.13, gain: 0.3 });
      noise({ from: 900, to: 120, dur: 0.1, gain: 0.22, filter: 'lowpass' });
    },

    eatGhost: function () {
      arp([300, 450, 600, 850], { type: 'square', bend: 1.25, dur: 0.1, gain: 0.18, step: 0.06 });
    },

    caught: function () {
      tone({ type: 'square', from: 900, to: 180, dur: 0.16, gain: 0.26 });
      tone({ type: 'sawtooth', from: 300, to: 90, dur: 0.26, gain: 0.18, delay: 0.03 });
      noise({ from: 3000, to: 300, dur: 0.18, gain: 0.16, filter: 'bandpass', q: 0.8 });
    },

    death: function () {
      PV.Sfx.stopSiren();
      var falling = [];
      for (var i = 0; i < 9; i++) falling.push(700 - i * 62);
      arp(falling, { type: 'square', bend: 0.7, dur: 0.14, gain: 0.2, step: 0.1 });
    },

    levelStart: function () {
      arp([523, 659, 784, 1046], { type: 'triangle', dur: 0.14, gain: 0.18, step: 0.13 });
    },

    levelClear: function () {
      PV.Sfx.stopSiren();
      arp([523, 659, 784, 1046, 1318], { type: 'triangle', dur: 0.16, gain: 0.2, step: 0.1 });
    },

    gameOver: function () {
      PV.Sfx.stopSiren();
      arp([392, 330, 262, 196], { type: 'sawtooth', bend: 0.9, dur: 0.34, gain: 0.16, step: 0.24 });
    },

    visionSwitch: function () {
      tone({ type: 'triangle', from: 620, to: 1150, dur: 0.09, gain: 0.14 });
    },

    visionDenied: function () {
      tone({ type: 'square', from: 130, to: 90, dur: 0.09, gain: 0.11 });
    },

    blinkFlash: function () {
      noise({ from: 400, to: 6000, dur: 0.22, gain: 0.11, filter: 'bandpass', q: 1.4 });
      tone({ type: 'sine', from: 900, to: 1800, dur: 0.18, gain: 0.07 });
    },

    startSiren: function () {
      if (!ensure() || muted || siren) return;
      var osc = ctx.createOscillator();
      var lfo = ctx.createOscillator();
      var lfoGain = ctx.createGain();
      var gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = 116;
      lfo.type = 'sine';
      lfo.frequency.value = 0.85;
      lfoGain.gain.value = 26;
      gain.gain.value = 0.028;

      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(gain).connect(master);
      osc.start(); lfo.start();
      siren = { osc: osc, lfo: lfo };
    },

    stopSiren: function () {
      if (!siren) return;
      try { siren.osc.stop(); siren.lfo.stop(); } catch (e) { /* already stopped */ }
      siren = null;
    },

    setSirenPitch: function (hz) {
      if (siren) siren.osc.frequency.value = hz;
    }
  };

})(window.PV);
