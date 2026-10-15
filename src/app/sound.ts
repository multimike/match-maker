// The round's sounds, synthesised with Web Audio so there are no files to load and they play
// instantly (the same approach as sport-timer). Browsers only allow audio after a tap, so
// unlockAudio() runs from the first tap on a button.

export type Cue = 'start' | 'warning' | 'buzzer';

let ctx: AudioContext | null = null;
let out: AudioNode | null = null;

interface AudioSessionNavigator {
  audioSession?: { type: string };
}

export function unlockAudio() {
  if (!ctx) {
    // iOS: play through the speaker even with the silent switch on.
    const audioSession = (navigator as Navigator & AudioSessionNavigator).audioSession;
    if (audioSession) audioSession.type = 'playback';
    ctx = new AudioContext();
    // A compressor lets the buzzer be loud without clipping.
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);
    out = compressor;
    // Older iOS only unlocks audio once a sound has started inside the tap.
    const silence = ctx.createBufferSource();
    silence.buffer = ctx.createBuffer(1, 1, 22050);
    silence.connect(ctx.destination);
    silence.start();
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

export function audioReady(): boolean {
  return ctx?.state === 'running';
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'square', volume = 0.35) {
  const c = ctx!;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.setValueAtTime(volume, t + dur - 0.03);
  gain.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(gain).connect(out!);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return osc;
}

// Referee whistle: a high tone with a fast trill.
function whistle(at: number, dur: number) {
  const c = ctx!;
  const osc = tone(2800, at, dur, 'sine', 0.6);
  const trill = c.createOscillator();
  const depth = c.createGain();
  trill.frequency.value = 35;
  depth.gain.value = 180;
  trill.connect(depth).connect(osc.frequency);
  const t = c.currentTime + at;
  trill.start(t);
  trill.stop(t + dur + 0.05);
}

// Sports-hall buzzer: two detuned low sawtooths, harsh enough to cut through a busy hall.
function buzzer(at: number, dur: number) {
  for (const freq of [196, 199.5, 392]) tone(freq, at, dur, 'sawtooth', freq > 300 ? 0.12 : 0.3);
}

const SOUNDS: Record<Cue, () => void> = {
  start: () => {
    whistle(0, 0.25);
    whistle(0.35, 0.7);
  },
  warning: () => [0, 0.2, 0.4].forEach((at) => tone(1320, at, 0.13)),
  buzzer: () => buzzer(0, 1.6),
};

export function play(cue: Cue) {
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  SOUNDS[cue]();
}
