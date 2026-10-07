/** Synthesized phone ring (no audio assets). Two tones with a slow tremolo, like a classic landline. */
export function ringPhone(rings = 2, ringSeconds = 1.8, gapSeconds = 1.1): { stop: () => void; duration: number } {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const duration = rings * ringSeconds + (rings - 1) * gapSeconds;
  if (!Ctx) return { stop: () => {}, duration };
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);
  const now = ctx.currentTime + 0.05;
  for (let i = 0; i < rings; i++) {
    const start = now + i * (ringSeconds + gapSeconds);
    const end = start + ringSeconds;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(1, start + 0.03);
    env.gain.setValueAtTime(1, end - 0.05);
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(master);
    // Tremolo gives the ring its warble.
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(trem.gain);
    trem.connect(env);
    for (const hz of [440, 480]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      osc.connect(trem);
      osc.start(start); osc.stop(end + 0.02);
    }
    lfo.start(start); lfo.stop(end + 0.02);
  }
  const close = () => { if (ctx.state !== 'closed') void ctx.close(); };
  const closeAt = window.setTimeout(close, (duration + 0.5) * 1000);
  return { duration, stop: () => { window.clearTimeout(closeAt); close(); } };
}
