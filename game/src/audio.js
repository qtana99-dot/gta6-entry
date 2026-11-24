// Procedural WebAudio: a two-oscillator engine whose pitch follows road speed, a two-tone siren
// that fades with distance, a slow synth pad, and noise-based gunshots, punches, impacts,
// footsteps, doors, pickups and UI clicks. Nothing is loaded from disk or the network.

import { AUDIO } from './config.js';
import { clamp, dist } from './math.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let engine = null;
  let siren = null;
  let lastWorld = null;
  let pad = null;
  let padTimer = 0;
  let padChord = 0;
  let chirpTimer = 9;
  let started = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = AUDIO.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    started = true;
    buildEngine();
    buildSiren();
    buildPad();
    try {
      const ambient = ctx.createBufferSource();
      ambient.buffer = noiseBuffer;
      ambient.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 620;
      bp.Q.value = 0.45;
      const ag = ctx.createGain();
      ag.gain.value = AUDIO.ambient;
      ambient.connect(bp);
      bp.connect(ag);
      ag.connect(master);
      ambient.start();
    } catch {
      // A browser without audio still plays the game silently.
    }
    return ctx;
  }

  function buildEngine() {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    osc.frequency.value = 60;
    osc2.frequency.value = 30;
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 1.2;
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start();
    osc2.start();
    engine = { osc, osc2, filter, gain };
  }

  function buildSiren() {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    siren = { osc, gain };
  }

  function buildPad() {
    const freqs = [110, 164.81, 220, 277.18];
    const voices = freqs.map((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      gain.gain.value = i === 0 ? 0.012 : 0.006;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      return { osc, gain };
    });
    pad = { voices };
  }

  function spatial(opts) {
    if (!opts || opts.x === undefined || !lastWorld) return 1;
    const d = dist(opts.x, opts.y, lastWorld.player.x, lastWorld.player.y);
    return clamp(1 - d / 1200, 0.05, 1);
  }

  function play(name, opts = {}) {
    if (!started) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const vol = (opts.quiet ? 0.35 : 1) * spatial(opts);
    try {
      switch (name) {
        case 'shot': sfxShot(t, vol * 0.9); break;
        case 'dryFire': sfxClick(t, 0.04, 0.12); break;
        case 'punch': sfxThump(t, 92, 0.16, 0.32 * vol); break;
        case 'hurt': sfxThump(t, 64, 0.22, 0.3); sfxNoise(t, 0.14, 0.14, 900); break;
        case 'impact': sfxImpact(t, clamp((opts.force ?? 200) / 600, 0.2, 1) * 0.6 * vol); break;
        case 'ricochet': sfxPing(t, 1400 + Math.random() * 900, 0.09, 0.08 * vol); break;
        case 'step': sfxNoise(t, 0.06, 0.035 * (opts.soft ? 0.7 : 1), 620 + Math.random() * 300); break;
        case 'door': sfxThump(t, 120, 0.1, 0.12); sfxClick(t, 0.05, 0.1); break;
        case 'click': sfxClick(t, 0.03, 0.09); break;
        case 'reload': sfxClick(t, 0.02, 0.08); sfxClick(t + 0.16, 0.02, 0.06); break;
        case 'reloadDone': sfxClick(t, 0.03, 0.11); sfxClick(t + 0.08, 0.03, 0.09); break;
        case 'wanted': sfxArp(t, [523, 415, 523], 0.09, 0.12); break;
        case 'lost': sfxArp(t, [392, 523, 659], 0.12, 0.09); break;
        case 'mission': sfxArp(t, [392, 523, 659, 784], 0.14, 0.12); break;
        case 'fail': sfxArp(t, [392, 330, 262], 0.18, 0.12); break;
        case 'unlock': sfxArp(t, [659, 784, 988, 1319], 0.1, 0.1); break;
        case 'pickup': sfxArp(t, [880, 1175], 0.07, 0.1); break;
        case 'dialogue': sfxClick(t, 0.02, 0.045); break;
        case 'horn': sfxHorn(t, opts.quiet ? 0.06 : 0.12); break;
        case 'sirenStart': sfxArp(t, [620, 880], 0.18, 0.08); break;
        case 'explosion': sfxExplosion(t); break;
        default: break;
      }
    } catch {
      // Keep the game running if an audio node rejects a parameter.
    }
  }

  function sfxShot(t, vol) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(260, t + 0.13);
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.42 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.22);
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.12);
    og.gain.setValueAtTime(0.28 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(og);
    og.connect(master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  function sfxNoise(t, dur, vol, freq) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function sfxThump(t, freq, dur, vol) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function sfxClick(t, dur, vol) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(820, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  function sfxPing(t, freq, dur, vol) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  function sfxImpact(t, vol) {
    sfxNoise(t, 0.16, 0.25 * vol, 380);
    sfxThump(t, 70, 0.18, 0.22 * vol);
  }

  function sfxArp(t, notes, step, vol) {
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * step);
      g.gain.linearRampToValueAtTime(vol, t + i * step + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * step + step * 1.6);
      osc.connect(g);
      g.connect(master);
      osc.start(t + i * step);
      osc.stop(t + i * step + step * 1.8);
    });
  }

  function sfxHorn(t, vol) {
    for (const f of [330, 415]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.setValueAtTime(vol, t + 0.24);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.33);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.36);
    }
  }

  function sfxExplosion(t) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    src.connect(lp);
    lp.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 1.15);
    sfxThump(t, 55, 0.7, 0.5);
  }

  function update(world, dt) {
    lastWorld = world;
    if (!started) return;
    const p = world.player;
    const car = p.driving;
    if (engine) {
      const speed = car ? Math.abs(car.forwardSpeed) : 0;
      const ratio = car ? clamp(speed / car.spec.maxSpeed, 0, 1) : 0;
      const targetGain = car && !car.dead ? AUDIO.engine * (0.55 + ratio * 0.75) : 0;
      const freq = 52 + ratio * 168 + (car && car.throttle > 0 ? 12 : 0);
      engine.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.08);
      engine.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.06);
      engine.osc2.frequency.setTargetAtTime(freq * 0.5, ctx.currentTime, 0.09);
      engine.filter.frequency.setTargetAtTime(300 + ratio * 1100, ctx.currentTime, 0.08);
    }
    if (siren) {
      const strength = world.police?.sirenActive
        ? clamp(1 - (world.heatNear ?? 900) / 1500, 0, 1)
        : 0;
      const phase = Math.sin(world.time * 8.5) > 0;
      siren.osc.frequency.setTargetAtTime(phase ? 690 : 940, ctx.currentTime, 0.09);
      siren.gain.gain.setTargetAtTime(strength * AUDIO.siren, ctx.currentTime, 0.2);
    }
    if (pad) {
      padTimer -= dt;
      if (padTimer <= 0) {
        padTimer = 7.5;
        padChord = (padChord + 1) % 4;
        const chords = [
          [110, 164.81, 220, 277.18],
          [98, 146.83, 196, 246.94],
          [87.31, 130.81, 174.61, 220],
          [116.54, 174.61, 233.08, 293.66],
        ];
        const notes = chords[padChord];
        pad.voices.forEach((v, i) => {
          v.osc.frequency.setTargetAtTime(notes[i], ctx.currentTime, 2.5);
        });
      }
    }
    chirpTimer -= dt;
    if (chirpTimer <= 0) {
      chirpTimer = 12 + Math.random() * 22;
      if (lastWorld.time > 360 && lastWorld.time < 1200) {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, t);
        osc.frequency.exponentialRampToValueAtTime(900, t + 0.18);
        g.gain.setValueAtTime(0.012, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(g);
        g.connect(master);
        osc.start(t);
        osc.stop(t + 0.24);
      }
    }
  }

  function setMuted(muted) {
    if (!master) return;
    master.gain.setTargetAtTime(muted ? 0 : AUDIO.master, ctx.currentTime, 0.05);
  }

  return {
    init: ensure,
    play,
    update,
    setMuted,
    get started() { return started; },
  };
}
