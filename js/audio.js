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
  if (synth && (synth.speaking || synth.pending)) synth.cancel();
  if (c && c.__resolve) c.__resolve("cancelled");
  recGen++;
  stopRecording();
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

// ---------------------------------------------------------------- recorded narration
// The Windows program's recordings ("Brian"), uploaded by make_web_audio.py to
// audio/<section>/<name>.mp3. Files are kept in their own cache so lessons work offline.
const AUDIO_CACHE = "ks-audio-1";
let manifest = null;              // audio/manifest.json, or null if not uploaded
let useRecorded = true;
let playing = null;               // {src, resolve}
let recGen = 0;                   // bumps on every stop, so a late-loading file isn't played
const decoded = new Map();        // url -> Promise<AudioBuffer> (a few, for the next sentence)

export async function loadManifest() {
  try {
    const r = await fetch("audio/manifest.json", { cache: "no-cache" });
    if (r.ok) manifest = await r.json();
  } catch (_) {
    try {   // offline: use the copy saved last time
      const c = await caches.open(AUDIO_CACHE);
      const hit = await c.match("audio/manifest.json");
      if (hit) manifest = await hit.json();
    } catch (_) { /* none */ }
  }
  if (manifest) {
    try { (await caches.open(AUDIO_CACHE)).put("audio/manifest.json", new Response(JSON.stringify(manifest))); } catch (_) { /* fine */ }
  }
  return manifest;
}
export const recordingsUploaded = () => !!manifest;
export function setUseRecorded(on) { useRecorded = on; }
export const usingRecorded = () => !!manifest && useRecorded;

// The address of a sentence's recording, or null if there isn't one.
export function recordingUrl(section, name) {
  if (!usingRecorded() || !name) return null;
  const s = manifest.sections && manifest.sections[section];
  return s ? `audio/${s.folder}/${name}.mp3` : null;
}

async function getBytes(url) {
  let c = null;
  try { c = await caches.open(AUDIO_CACHE); } catch (_) { /* no cache storage */ }
  if (c) {
    const hit = await c.match(url);
    if (hit) return hit.arrayBuffer();
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error("missing " + url);
  if (c) c.put(url, r.clone()).catch(() => {});
  return r.arrayBuffer();
}

function decode(url) {
  if (!decoded.has(url)) {
    unlockSounds();
    const p = getBytes(url).then((buf) => new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej)));
    p.catch(() => decoded.delete(url));
    decoded.set(url, p);
    while (decoded.size > 6) decoded.delete(decoded.keys().next().value);
  }
  return decoded.get(url);
}

// Get the next sentence ready while this one plays.
export function preloadRecording(url) { if (url && ctx) decode(url).catch(() => {}); }

function stopRecording() {
  const p = playing;
  playing = null;
  if (p) {
    try { p.src.onended = null; p.src.stop(); } catch (_) { /* already stopped */ }
    p.resolve("cancelled");
  }
}

// Play one sentence's recording. Resolves "ended", "cancelled", or "failed" (no file / can't play).
export async function playRecording(url) {
  stopRecording();
  if (synth && (synth.speaking || synth.pending)) synth.cancel();
  const gen = ++recGen;
  let buf;
  try {
    if (!ctx) unlockSounds();
    if (!ctx) return "failed";
    if (ctx.state === "suspended") await ctx.resume();
    buf = await decode(url);
  } catch (_) { return gen === recGen ? "failed" : "cancelled"; }
  if (gen !== recGen) return "cancelled";
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const me = { src, resolve };
    src.onended = () => { if (playing === me) { playing = null; resolve("ended"); } };
    playing = me;
    // the stand-in for "current" so stopSpeaking() cancels this too
    current = { __resolve: () => stopRecording() };
    src.start();
  });
}

// Say a sentence: the recording if there is one, otherwise the device's voice.
export async function narrate(text, url) {
  if (url) {
    const how = await playRecording(url);
    if (how !== "failed") return how;
  }
  return speak(text);
}

// Download a section's recordings in the background (for offline use).
// names: the recording names; onProgress(done, total).
const saving = new Map();
export function saveSection(section, names, onProgress) {
  if (!usingRecorded() || !(manifest.sections || {})[section]) return Promise.resolve(false);
  if (saving.has(section)) return saving.get(section);
  const job = (async () => {
    const c = await caches.open(AUDIO_CACHE);
    const urls = [...new Set(names)].map((n) => recordingUrl(section, n));
    const have = new Set((await c.keys()).map((r) => new URL(r.url).href));
    const todo = urls.filter((u) => !have.has(new URL(u, location.href).href));
    let done = urls.length - todo.length;
    if (onProgress) onProgress(done, urls.length);
    let i = 0, failed = 0;
    const worker = async () => {
      while (i < todo.length) {
        const u = todo[i++];
        try {
          const r = await fetch(u);
          if (r.ok) await c.put(u, r); else failed++;
        } catch (_) { failed++; }
        done++;
        if (onProgress && (done % 20 === 0 || done === urls.length)) onProgress(done, urls.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return failed === 0;
  })().finally(() => saving.delete(section));
  saving.set(section, job);
  return job;
}

// How many of a section's recordings are saved on this device.
export async function savedCount(section) {
  if (!usingRecorded()) return 0;
  const s = (manifest.sections || {})[section];
  if (!s) return 0;
  try {
    const c = await caches.open(AUDIO_CACHE);
    return (await c.keys()).filter((r) => r.url.includes(`/audio/${s.folder}/`)).length;
  } catch (_) { return 0; }
}
export const sectionFileCount = (section) => (manifest && manifest.sections && manifest.sections[section] || {}).files || 0;

// Saved recordings per section folder, e.g. {"2_1": 812, ...} (one look at the cache).
export async function savedCounts() {
  const out = {};
  if (!usingRecorded()) return out;
  try {
    const c = await caches.open(AUDIO_CACHE);
    for (const r of await c.keys()) {
      const m = /\/audio\/([^/]+)\/[^/]+\.mp3$/.exec(new URL(r.url).pathname);
      if (m) out[m[1]] = (out[m[1]] || 0) + 1;
    }
  } catch (_) { /* no cache */ }
  return out;
}
export const sectionFolder = (section) => (manifest && manifest.sections && manifest.sections[section] || {}).folder;
