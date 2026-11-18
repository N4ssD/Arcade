// Sons de l'interface, synthétisés en direct (aucun fichier audio) :
// courts, doux, avec un peu de réverbération, dans l'esprit des sons d'Opera GX.
const Sound = (() => {
  'use strict';
  let ctx = null, master = null, reverb = null, noiseBuf = null;
  const cfg = { enabled: true, volume: 0.3, hover: true, click: true };
  let lastHover = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    const comp = ctx.createDynamicsCompressor(); // évite toute saturation
    comp.threshold.value = -9; comp.knee.value = 12; comp.ratio.value = 6;
    master = ctx.createGain();
    master.connect(comp); comp.connect(ctx.destination);
    applyVolume();

    // Réverbération douce générée (bruit qui s'éteint)
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    reverb = ctx.createGain(); reverb.gain.value = 0.55;
    reverb.connect(conv); conv.connect(master);

    // Bruit blanc pour les "souffles"
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function applyVolume() {
    if (!master) return;
    master.gain.value = Math.pow(cfg.volume, 1.5) * 4.2; // courbe naturelle, niveau net mais doux
  }

  // Une note douce avec enveloppe
  function tone({ f, f2, dur = 0.2, type = 'sine', gain = 0.1, attack = 0.008, delay = 0, rev = 0.3, lp = 0 }) {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (lp) {
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = lp;
      o.connect(filt); node = filt;
    }
    node.connect(g);
    g.connect(master);
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverb); }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // Un souffle filtré qui glisse (effet "whoosh" léger)
  function sweep({ f1, f2, dur = 0.4, gain = 0.05, q = 1.2, delay = 0, rev = 0.3 }) {
    const t0 = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f1, t0);
    bp.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bp); bp.connect(g); g.connect(master);
    if (rev > 0) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r); r.connect(reverb); }
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  const library = {
    hover()  { tone({ f: 1500, f2: 1150, dur: 0.06, gain: 0.07, rev: 0.12 }); },
    click()  { tone({ f: 640, f2: 420, dur: 0.1, gain: 0.3, rev: 0.15 }); tone({ f: 1280, f2: 840, dur: 0.06, gain: 0.08, rev: 0.1 }); },
    nav()    { tone({ f: 440, f2: 660, dur: 0.16, type: 'triangle', gain: 0.22 }); tone({ f: 880, dur: 0.14, gain: 0.09, delay: 0.05 }); },
    pop()    { tone({ f: 700, f2: 520, dur: 0.07, gain: 0.08, rev: 0.15 }); },
    tick()   { tone({ f: 900, dur: 0.035, gain: 0.1, rev: 0 }); },
    toggleOn()  { tone({ f: 520, dur: 0.07, gain: 0.1, rev: 0.2 }); tone({ f: 780, dur: 0.12, gain: 0.1, delay: 0.06, rev: 0.3 }); },
    toggleOff() { tone({ f: 780, dur: 0.07, gain: 0.09, rev: 0.2 }); tone({ f: 520, dur: 0.12, gain: 0.09, delay: 0.06, rev: 0.3 }); },
    open()   { sweep({ f1: 300, f2: 1800, dur: 0.35, gain: 0.05 }); tone({ f: 330, f2: 495, dur: 0.3, gain: 0.07, rev: 0.45 }); },
    close()  { sweep({ f1: 1800, f2: 300, dur: 0.25, gain: 0.04 }); tone({ f: 495, f2: 330, dur: 0.22, gain: 0.06, rev: 0.35 }); },
    success() { [587, 740, 880, 1175].forEach((f, i) => tone({ f, dur: 0.55, gain: 0.09, delay: i * 0.085, rev: 0.55, attack: 0.01 })); },
    launch() {
      sweep({ f1: 200, f2: 3500, dur: 0.9, gain: 0.06, q: 1 });
      tone({ f: 110, f2: 165, dur: 0.7, gain: 0.14, rev: 0.2, attack: 0.05 });
      [330, 494, 659, 988].forEach((f, i) => tone({ f, dur: 0.95, gain: 0.06, attack: 0.14, delay: 0.04 * i, rev: 0.6 }));
    },
    fav()    { tone({ f: 988, dur: 0.25, gain: 0.09, rev: 0.5 }); tone({ f: 1480, dur: 0.3, gain: 0.07, delay: 0.07, rev: 0.6 }); },
    unfav()  { tone({ f: 660, f2: 494, dur: 0.2, gain: 0.08, rev: 0.4 }); },
    error()  { tone({ f: 220, f2: 165, dur: 0.18, gain: 0.14, lp: 900, rev: 0.1 }); tone({ f: 220, f2: 165, dur: 0.18, gain: 0.12, lp: 900, delay: 0.14, rev: 0.1 }); },
    delete() { tone({ f: 520, f2: 260, dur: 0.24, gain: 0.11, rev: 0.4 }); },
    start()  {
      sweep({ f1: 150, f2: 1200, dur: 1.0, gain: 0.03, rev: 0.5 });
      [392, 523, 784].forEach((f, i) => tone({ f, dur: 1.1, gain: 0.07, attack: 0.1, delay: 0.12 * i, rev: 0.7 }));
    }
  };

  function play(name) {
    if (!cfg.enabled || cfg.volume <= 0) return;
    if (name === 'hover') {
      if (!cfg.hover) return;
      const now = performance.now();
      if (now - lastHover < 70) return;
      lastHover = now;
    }
    if (!cfg.click && (name === 'click' || name === 'nav' || name === 'tick')) return;
    const fn = library[name];
    if (!fn) return;
    try {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      fn();
    } catch {}
  }

  function configure(c) {
    Object.assign(cfg, c);
    applyVolume();
  }

  // Les navigateurs ne démarrent l'audio qu'après une interaction : on le réveille au premier clic/touche.
  const wake = () => { try { if (ensure() && ctx.state === 'suspended') ctx.resume(); } catch {} };
  window.addEventListener('pointerdown', wake, { once: true, capture: true });
  window.addEventListener('keydown', wake, { once: true, capture: true });

  return { play, configure, test: () => { const was = cfg.enabled; cfg.enabled = true; play('success'); cfg.enabled = was; } };
})();
