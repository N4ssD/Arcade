// Musique d'ambiance : douce, générée en direct (aucun fichier audio) — nappes lentes + quelques notes de cloche.
const Music = (() => {
  'use strict';
  const CHORDS = [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 52, 55, 59, 64], [43, 50, 55, 59, 62]]; // Am9, Fmaj7, Cmaj7, G6
  const BELLS = [69, 72, 74, 76, 79, 81];
  const CHORD_LEN = 8;
  let ctx = null, out = null, echo = null, timer = 0, nextAt = 0, idx = 0, wanted = false, vol = 20, held = false, armed = false, sawRun = false, gesture = true; // le moteur autorise la lecture sans clic ; sinon elle démarre au premier clic
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
    // écho doux
    const d = ctx.createDelay(1); d.delayTime.value = 0.46;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
    echo = ctx.createGain(); echo.gain.value = 0.5;
    echo.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(out);
    return true;
  }
  const level = () => Math.pow(Math.max(0, Math.min(100, vol)) / 100, 1.6) * 0.9;

  function pad(m, t, len) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = det;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.028, t + 1.4);
      g.gain.setValueAtTime(0.028, t + len - 3);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(f); f.connect(g); g.connect(out); g.connect(echo);
      o.start(t); o.stop(t + len + 0.1);
    }
  }
  function bell(m, t) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(g); g.connect(out); g.connect(echo);
    o.start(t); o.stop(t + 3.3);
  }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    while (nextAt < ctx.currentTime + 2.5) {
      if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.1;
      const ch = CHORDS[idx % CHORDS.length]; idx++;
      ch.forEach((m, i) => pad(m, nextAt + i * 0.12, CHORD_LEN + 3));
      const n = 2 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) bell(BELLS[Math.floor(Math.random() * BELLS.length)], nextAt + 0.6 + k * 2 + Math.random() * 1.2);
      nextAt += CHORD_LEN;
    }
  }
  function sync() {
    const run = wanted && gesture && !document.hidden && vol > 0 && !held;
    try {
      if (run) {
        if (!ctx && !build()) return;
        if (ctx.state === 'suspended') ctx.resume();
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setTargetAtTime(level(), ctx.currentTime, 0.6);
        if (!timer) { nextAt = ctx.currentTime + 0.2; timer = setInterval(tick, 600); setTimeout(tick, 100); }
      } else if (ctx) {
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        if (timer) { clearInterval(timer); timer = 0; }
        setTimeout(() => { if (ctx && !timer) ctx.suspend().catch(() => {}); }, 1800);
      }
    } catch {}
  }
  function configure(c) {
    if (typeof c.on === 'boolean') wanted = c.on;
    if (typeof c.vol === 'number') vol = c.vol;
    sync();
  }
  // Un jeu se lance : la musique se coupe jusqu'à ce que le jeu se ferme ou qu'Arcade revienne au premier plan
  function hold(on) { held = on; armed = false; sawRun = false; sync(); }
  function release(runningCount) {
    if (!held) return;
    if (runningCount > 0) sawRun = true;
    else if (sawRun) { held = false; sync(); }
  }
  window.addEventListener('blur', () => { if (held) armed = true; });
  window.addEventListener('focus', () => { if (held && armed) { held = false; sync(); } });
  // L'audio ne démarre qu'après une interaction (règle du navigateur)
  const wake = () => { gesture = true; try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch {} sync(); };
  window.addEventListener('pointerdown', wake, { once: true, capture: true });
  window.addEventListener('keydown', wake, { once: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (held) armed = true; } else if (held && armed) held = false; sync(); });
  return { configure, hold, release };
})();
