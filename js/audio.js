// Narration (the device's own text-to-speech voice) and sound effects.

// ---------------------------------------------------------------- narration
const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let voices = [];
let chosen = null;          // SpeechSynthesisVoice
let rate = 0.9;
let current = null;         // the utterance being spoken (kept so it isn't garbage-collected)

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices();
}
if (synth) {
  loadVoices();
  if (synth.addEventListener) synth.addEventListener("voiceschanged", loadVoices);
  else synth.onvoiceschanged = loadVoices;
}

// Voices worth offering: English ones, the nicer-sounding ones first.
export function englishVoices() {
  loadVoices();
  const score = (v) => {
    let s = 0;
    if (/^en[-_]US/i.test(v.lang)) s += 4;
    else if (/^en[-_](GB|AU|CA|IE|NZ)/i.test(v.lang)) s += 3;
    if (/natural|neural|enhanced|premium|online/i.test(v.name)) s += 5;
    if (/google/i.test(v.name)) s += 2;
    if (/samantha|daniel|karen|alex|ava|evan|aaron|nicky|tom|serena|moira/i.test(v.name)) s += 2;
    if (/novelty|whisper|bells|bubbles|cellos|zarvox|trinoids|boing|bad news|good news|jester|organ|superstar|wobble|albert|fred|junior|ralph|kathy|grandpa|grandma|eddy|flo|reed|rocko|sandy|shelley/i.test(v.name)) s -= 10;
    if (v.localService) s += 1;
    return s;
  };
  return voices.filter((v) => /^en/i.test(v.lang)).sort((a, b) => score(b) - score(a));
}

export function setVoice(name) {
  const list = englishVoices();
  chosen = list.find((v) => v.name === name) || list[0] || null;
}
export function voiceName() {
  if (!chosen) setVoice(null);
  return chosen ? chosen.name : "";
}
export function setRate(r) { rate = r; }
export const speechAvailable = () => !!synth;

// About how long a sentence takes to say (used if the voice never reports that it finished).
const estimate = (text) => (0.35 + text.split(/\s+/).length / 2.3) / rate;

// Say one sentence. Resolves with "ended" or "cancelled".
export function speak(text) {
  return new Promise((resolve) => {
    let settled = false, timer = null, startTimer = null;
    const done = (how) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(startTimer);
      if (current && current.__resolve === done) current = null;
      resolve(how);
    };
    if (!synth || !text.trim()) {
      // no voice: just give the reader time to read along
      timer = setTimeout(() => done("ended"), estimate(text) * 1000);
      current = { __resolve: done, silent: true };
      return;
    }
    if (!chosen) setVoice(null);
    if (synth.speaking || synth.pending) synth.cancel();
    if (synth.paused) synth.resume();
    const u = new SpeechSynthesisUtterance(text);
    if (chosen) { u.voice = chosen; u.lang = chosen.lang; } else u.lang = "en-US";
    u.rate = rate;
    u.__resolve = done;
    u.onend = () => done("ended");
    const t0 = Date.now();
    u.onerror = (e) => {
      if (e && (e.error === "interrupted" || e.error === "canceled")) { done("cancelled"); return; }
      // the voice failed: still give the reader time to read the sentence
      clearTimeout(timer);
      timer = setTimeout(() => done("ended"), Math.max(0, estimate(text) * 1000 - (Date.now() - t0)));
    };
    current = u;
    // Some phones never say when they're done; don't get stuck.
    timer = setTimeout(() => done("ended"), (estimate(text) * 1.8 + 4) * 1000);
    synth.speak(u);
  });
}

export function stopSpeaking() {
  const c = current;
  current = null;
  if (synth) synth.cancel();
  if (c && c.__resolve) c.__resolve("cancelled");
}

// iPhones and iPads only allow speech after the first tap; say nothing on that tap.
export function unlockSpeech() {
  if (!synth) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
  } catch (_) { /* ignore */ }
}

// ---------------------------------------------------------------- sound effects
const SOUNDS = ["move", "tick", "bad", "good", "coin", "star", "battle", "rankup", "rewind", "yourmove", "again"];
let ctx = null;
const buffers = {};
let soundOn = true;

export function setSoundOn(on) { soundOn = on; }

export function unlockSounds() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      for (const name of SOUNDS) {
        fetch(`snd/${name}.wav`).then((r) => r.arrayBuffer())
          .then((buf) => new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej)))
          .then((b) => { buffers[name] = b; }).catch(() => {});
      }
    }
    if (ctx.state === "suspended") ctx.resume();
  } catch (_) { /* no sound, that's all right */ }
}

export function play(name, volume = 0.6) {
  if (!soundOn || !ctx || !buffers[name]) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(ctx.destination);
    src.start();
  } catch (_) { /* ignore */ }
}
