// Knight School on the web: the screens (players, home, lessons list, credits) and start-up.
import { course, loadCourse, sectionRecordings } from "./course.js";
import * as store from "./store.js";
import { Progress, RANKS, rankOf, AVATARS, DEV_PASSWORD } from "./store.js";
import { readCode, CodeError } from "./progress_code.js";
import * as audio from "./audio.js";
import { h, badge, modal, ask, askPassword, pieceImg, toast } from "./ui.js";
import { Lesson } from "./lesson.js";

const root = document.getElementById("app");

const app = {
  progress: null,
  dev: false,
  screen: null,      // the current Lesson, if any

  show(name, opts = {}) {
    if (this.screen && this.screen.destroy) this.screen.destroy();
    this.screen = null;
    root.replaceChildren();
    window.scrollTo(0, 0);
    if (name !== "players" && !this.progress) name = "players";
    const screens = { players: playersScreen, home: homeScreen, sections: sectionsScreen, credits: creditsScreen };
    if (name === "learn" || name === "quiz") {
      const l = new Lesson(this, name, opts.index || 0);
      this.screen = l;
      l.mount(root);
      return;
    }
    root.append(screens[name](opts));
  },

  choosePlayer(p) {
    this.progress = new Progress(p);
    store.setLastPlayer(p.id);
    this.show("home");
  },

  resumeIndex(section = null) {
    const flat = course.flat;
    const reached = this.dev ? flat.length - 1 : this.progress.reachedIndex(flat);
    if (section == null) return reached;
    const sec = course.sections.find((s) => s.section === section);
    if (reached < sec.first) return sec.first;
    return Math.min(reached, sec.last);
  },

  settingsDialog() { settingsDialog(); },
};

// ------------------------------------------------------------------ Who's playing?
function playersScreen() {
  const list = store.players();
  const grid = h("div.player-grid",
    list.map((p) => {
      const rank = rankOf(store.playerPoints(p));
      return h("button.player-card", { onclick: () => app.choosePlayer(p) },
        pieceImg(p.avatar || "wN", "avatar"), h("b", p.name), h("small", rank.name));
    }),
    h("button.player-card.add", { onclick: newPlayerDialog }, h("span.plus", "+"), h("b", "New player")));
  return h("div.screen.players",
    h("h1.title", "Who's playing?"),
    h("p.sub", "Pick your name, or add a new player."),
    grid,
    h("div.bottom-links",
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); codesDialog(); } }, "Progress codes (move a player to another phone, tablet or computer)"),
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); removePlayer(); } }, "Remove a player (grown-ups)")));
}

function newPlayerDialog() {
  let chosen = "wN";
  const name = h("input.big", { type: "text", maxlength: 20, placeholder: "Your name", autocomplete: "off", autocapitalize: "words" });
  const msg = h("p.msg");
  const pieces = h("div.avatar-pick", AVATARS.map((a) => {
    const b = h("button.av" + (a === chosen ? ".on" : ""), { onclick: () => {
      chosen = a;
      pieces.querySelectorAll(".av").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    } }, pieceImg(a));
    return b;
  }));
  const ok = () => {
    const nm = name.value.trim().split(/\s+/).join(" ");
    if (!nm) { msg.textContent = "Please type a name."; return; }
    if (store.players().some((p) => store.normName(p.name) === store.normName(nm))) {
      msg.textContent = `There's already a player called ${nm}.`;
      return;
    }
    const p = store.addPlayer(nm.slice(0, 20), chosen);
    m.close();
    app.choosePlayer(p);
  };
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
  const m = modal([h("h2", "What's your name?"), name, h("p.soft", "Pick your piece:"), pieces, msg,
    h("div.row.center", h("button.btn.good.big", { onclick: ok }, "Let's play!"))]);
  setTimeout(() => name.focus(), 50);
}

async function removePlayer() {
  if (!store.players().length) { toast("There are no players yet."); return; }
  const pw = await askPassword("Grown-up password");
  if (pw == null) return;
  if (pw !== DEV_PASSWORD) { toast("Wrong password."); return; }
  const m = modal([h("h2", "Remove which player?"),
    h("div.rm-list", store.players().map((p) => h("div.rm-row", pieceImg(p.avatar || "wN", "small-av"),
      h("span.grow", `${p.name}   (★ ${((p.progress || {}).solved || []).length})`),
      h("button.btn.small.bad", { onclick: async () => {
        if (!(await ask("Remove a player", `Remove ${p.name} and all of their progress? This can't be undone.`))) return;
        store.removePlayer(p.id);
        if (app.progress && app.progress.player.id === p.id) app.progress = null;
        m.close();
        app.show("players");
      } }, "Remove")))),
    h("div.row.center", h("button.btn.grey", { onclick: () => m.close() }, "Close"))]);
}

// ------------------------------------------------------------------ progress codes
function codesDialog() {
  const flat = course.flat;
  const codeBox = h("div.code-box.hidden");
  const copyBtn = h("button.btn.small.purple.hidden", "Copy");
  const rows = h("div.code-players", store.players().length ? store.players().map((p) =>
    h("button.code-player", { onclick: async () => {
      const code = await new Progress(p).code(flat);
      codeBox.textContent = code;
      codeBox.classList.remove("hidden");
      copyBtn.classList.remove("hidden");
      copyBtn.textContent = "Copy";
      copyBtn.onclick = async () => {
        try { await navigator.clipboard.writeText(code); copyBtn.textContent = "Copied!"; } catch (_) { copyBtn.textContent = "Write it down!"; }
      };
    } }, pieceImg(p.avatar || "wN", "small-av"), p.name)) : h("p.soft", "(No players yet.)"));
  const typed = h("input.big.mono", { type: "text", placeholder: "Name-XXXX-XXXX-XXXX", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  const msg = h("p.msg");
  const load = async () => {
    let info;
    try { info = await readCode(typed.value); } catch (e) {
      msg.className = "msg";
      msg.textContent = e instanceof CodeError ? e.message : "That code doesn't look right.";
      return;
    }
    const idx = store.codeIndex(flat, info.reached);
    const existing = store.players().find((p) => store.normName(p.name) === store.normName(info.name));
    let player;
    if (existing) {
      const cur = new Progress(existing);
      const curIdx = cur.reachedIndex(flat), curPts = cur.points;
      if (curIdx === idx && curPts === info.points) {
        msg.className = "msg good";
        msg.textContent = `${existing.name} is already up to date here.`;
        return;
      }
      if ((curIdx > idx || curPts > info.points) && !(await ask("Progress codes",
        `${existing.name} already has more progress here (${curPts} points, page ${curIdx + 1}) than this code (${info.points} points, page ${idx + 1}). Replace it with the code's progress?`))) return;
      existing.progress = store.progressFromCode(info, flat, existing.progress);
      existing.avatar = info.avatar;
      store.save();
      player = existing;
      if (app.progress && app.progress.player.id === existing.id) app.progress = new Progress(existing);
    } else {
      let nm = info.name.slice(0, 20);
      if (nm === nm.toLowerCase() || nm === nm.toUpperCase()) nm = nm.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
      player = store.addPlayer(nm, info.avatar, store.progressFromCode(info, flat));
    }
    msg.className = "msg good";
    msg.textContent = `Welcome, ${player.name}! ${rankOf(info.points).name} with ${info.points} points, up to Figure ${flat[idx].fig}.`;
    setTimeout(() => { m.close(); app.show("players"); }, 2500);
  };
  typed.addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
  const m = modal([
    h("h2", "Get a progress code"),
    h("p.soft", "Tap your name and write the code down. Then type it into Knight School on the other phone, tablet or computer (the Windows program works too)."),
    rows, codeBox, h("div.row.center", copyBtn),
    h("hr"),
    h("h2", "Have a code from another device?"),
    typed,
    h("div.row.center", h("button.btn.good", { onclick: load }, "Load this code")),
    msg,
    h("div.row.center", h("button.btn.grey.small", { onclick: () => m.close() }, "Close")),
  ], { wide: true });
}

// ------------------------------------------------------------------ home
function homeScreen() {
  const prog = app.progress;
  const pts = prog.points;
  const rank = rankOf(pts);
  const playable = course.flat.filter((p) => p.playable);
  const solved = playable.filter((p) => prog.solved(p.fig)).length;
  const floaters = h("div.floaters", ["wN", "bN", "wQ", "bR", "wB", "bK", "wR", "bQ", "wP", "bB"].map((k, i) => {
    const img = pieceImg(k, "floater");
    img.style.left = (i * 10 + Math.random() * 6) + "%";
    img.style.animationDelay = (-Math.random() * 20) + "s";
    img.style.animationDuration = (16 + Math.random() * 12) + "s";
    return img;
  }));
  const dev = h("button.dev-lock" + (app.dev ? ".on" : ""), { onclick: devClicked, "aria-label": "Grown-up settings" },
    app.dev ? "🔓 Dev mode ON (tap to turn off)" : "🔒");
  return h("div.screen.home", floaters,
    h("div.home-top",
      h("button.who-btn", { onclick: () => app.show("players") }, badge(rank, 52),
        h("span.who-text", h("b", `Playing as ${prog.name}`), h("small", `${rank.name} · ${pts} points · switch player`))),
      h("span.grow"),
      h("button.btn.small.icon.light", { onclick: settingsDialog, "aria-label": "Settings" }, "⚙"),
      dev),
    h("div.home-card",
      pieceImg("wN", "home-knight"),
      h("h1.title", "Knight School"),
      h("p.sub", "Learn to spot winning moves, one fork at a time!"),
      h("div.home-btns",
        h("button.btn.huge.purple", { onclick: () => app.show("sections") }, "Learn"),
        h("button.btn.huge.orange", { onclick: () => app.show("quiz") }, "Quizzer: Puzzle Time!")),
      h("p.stat", `★ ${solved} of ${playable.length} puzzles solved`),
      h("a.credits-link", { href: "#", onclick: (e) => { e.preventDefault(); app.show("credits"); } },
        "Lessons by Ward Farnsworth · Credits & licenses")),
    h("div.checker-strip"));
}

async function devClicked() {
  if (app.dev) { app.dev = false; app.show("home"); return; }
  const pw = await askPassword("Dev mode");
  if (pw == null) return;
  if (pw === DEV_PASSWORD) {
    app.dev = true;
    toast("Dev mode is on until the app is closed: narration can be skipped, Next always works.", 3500);
  } else toast("Wrong password.");
  app.show("home");
}

// ------------------------------------------------------------------ choose a lesson
function sectionsScreen() {
  const prog = app.progress;
  const flat = course.flat;
  const reached = app.dev ? flat.length - 1 : prog.reachedIndex(flat);
  const here = flat[reached];
  const body = h("div.sections");
  body.append(h("button.btn.big.good.keep-going", { onclick: () => app.show("learn", { index: app.resumeIndex() }) },
    `▶ Keep going: ${here.sectionTitle}, Figure ${here.fig}`));
  let chapter = null;
  const savedMarks = [];
  for (const sec of course.sections) {
    if (sec.chapter !== chapter) {
      chapter = sec.chapter;
      body.append(h("h2.chapter", chapter));
    }
    const pages = flat.slice(sec.first, sec.last + 1);
    const puzzles = pages.filter((p) => p.playable);
    const stars = puzzles.filter((p) => prog.solved(p.fig)).length;
    const open = sec.first <= reached;
    const saved = h("span.saved");
    savedMarks.push([sec.section, saved]);
    body.append(h("button.section-btn" + (open ? "" : ".locked"), {
      disabled: !open, onclick: () => app.show("learn", { index: app.resumeIndex(sec.section) }),
    }, h("span.num", (open ? "" : "🔒 ") + sec.section), h("span.name", sec.title, saved),
    h("span.stars", `★ ${stars} of ${puzzles.length}`)));
  }
  // which lessons' narration is already saved on this device (works offline)
  audio.savedCounts().then((counts) => {
    for (const [section, el] of savedMarks) {
      const total = audio.sectionFileCount(section);
      if (total && (counts[audio.sectionFolder(section)] || 0) >= total) el.textContent = " 🔊 saved";
    }
  });
  return h("div.screen.sections-screen",
    h("header.bar", h("button.btn.small.home", { onclick: () => app.show("home"), "aria-label": "Home" }, "⌂"),
      h("div.bar-title.big", "Choose a lesson")),
    h("div.scroll", body));
}

// ------------------------------------------------------------------ credits
function creditsScreen() {
  const link = (href, text) => h("a", { href, target: "_blank", rel: "noopener" }, text);
  return h("div.screen.credits-screen",
    h("header.bar", h("button.btn.small.home", { onclick: () => app.show("home"), "aria-label": "Home" }, "⌂"),
      h("div.bar-title.big", "Credits & licenses")),
    h("div.scroll", h("div.credits",
      h("h2", "The lessons"),
      h("p", "All lesson text and positions are from ", h("i", "Predator at the Chessboard: A Field Guide to Chess Tactics"),
        " by Ward Farnsworth, ", link("https://www.chesstactics.org", "www.chesstactics.org"),
        ", used under the ", link("http://creativecommons.org/licenses/by-nc-nd/2.5/", "Creative Commons Attribution-NonCommercial-NoDerivs 2.5 license"),
        ". His words are shown and read aloud exactly as written; this app only adds the board, the tappable moves and the voice. Free, non-commercial use only."),
      h("p", "If you enjoy the lessons, his books are wonderful: ", h("i", "Predator at the Chessboard"), " (two volumes)."),
      h("h2", "Chess pieces"),
      h("p", "The Chessnut piece set by Alexis Luengas, Apache License 2.0."),
      h("h2", "Move checking"),
      h("p", link("https://github.com/jhlywa/chess.js", "chess.js"), " by Jeff Hlywa, BSD 2-Clause license."),
      h("h2", "The voice"),
      h("p", "The narration uses your phone's or computer's own built-in voice. You can pick a different voice in Settings (⚙)."),
      h("h2", "Saving progress"),
      h("p", "Progress is saved on this device, in this browser. To move a player to another device, or as a backup, use Progress codes on the “Who's playing?” screen."))));
}

// ------------------------------------------------------------------ settings
function settingsDialog() {
  const s = store.settings();
  const voices = audio.englishVoices();
  const sel = h("select.voice", voices.length ? voices.map((v) => h("option", { value: v.name }, `${v.name} (${v.lang})`))
    : h("option", { value: "" }, "(no voices found)"));
  sel.value = audio.voiceName();
  sel.onchange = () => { audio.setVoice(sel.value); store.saveSettings({ voice: sel.value }); };
  const rate = h("input", { type: "range", min: 0.6, max: 1.3, step: 0.05, value: s.rate });
  const rateLbl = h("span", `${Math.round(s.rate * 100)}%`);
  rate.oninput = () => {
    const r = +rate.value;
    rateLbl.textContent = `${Math.round(r * 100)}%`;
    audio.setRate(r);
    store.saveSettings({ rate: r });
  };
  const snd = h("input", { type: "checkbox" });
  snd.checked = s.sound;
  snd.onchange = () => { audio.setSoundOn(snd.checked); store.saveSettings({ sound: snd.checked }); };
  // Narrator: the recorded voice from the Windows program, or this device's own voice
  const uploaded = audio.recordingsUploaded();
  const narrator = h("select.voice",
    h("option", { value: "recorded", disabled: !uploaded }, "Recorded (same as Windows)"),
    h("option", { value: "device" }, "This device's voice"));
  narrator.value = uploaded && s.recorded !== false ? "recorded" : "device";
  const deviceRows = h("div",
    h("label.set-row", h("span", "Device voice"), sel),
    h("label.set-row", h("span", "Speed"), rate, rateLbl),
    !audio.speechAvailable() ? h("p.msg", "This browser can't speak, so the narration will be shown but not read aloud.") : null,
    h("p.soft.small", "Tip: for the nicest device voice on an iPhone or iPad, download an \u201cEnhanced\u201d English voice in the Settings app (Accessibility \u203a Spoken Content \u203a Voices)."));
  const showRows = () => deviceRows.classList.toggle("hidden", narrator.value === "recorded");
  narrator.onchange = () => {
    const rec = narrator.value === "recorded";
    audio.setUseRecorded(rec);
    store.saveSettings({ recorded: rec });
    showRows();
  };
  showRows();
  const test = async () => {
    audio.stopSpeaking();
    if (narrator.value === "recorded") {
      const names = await sectionRecordings("2.1").catch(() => []);
      return audio.narrate("We begin our study of tactics with double attacks.", audio.recordingUrl("2.1", names[0]));
    }
    return audio.speak("Watch the board: the knight forks the king and the rook!");
  };
  const m = modal([
    h("h2", "Settings"),
    h("label.set-row", h("span", "Narrator"), narrator),
    deviceRows,
    h("div.row.center", h("button.btn.small.purple", { onclick: test }, "\u25b6 Test the voice")),
    h("label.set-row", h("span", "Sound effects"), snd),
    uploaded ? h("p.soft.small", "Each lesson's narration (and the next lesson's) is saved on this device when you open it, so it works without the internet.")
      : h("p.soft.small", "The Windows program's recorded voice hasn't been uploaded to the web site yet."),
    h("div.row.center", h("button.btn.grey", { onclick: () => { audio.stopSpeaking(); m.close(); } }, "Close")),
  ]);
}

// ------------------------------------------------------------------ start-up
function firstTouch() {
  audio.unlockSounds();
  audio.unlockSpeech();
  document.removeEventListener("pointerdown", firstTouch, true);
  document.removeEventListener("keydown", firstTouch, true);
}

async function boot() {
  const s = store.settings();
  audio.setRate(s.rate);
  audio.setSoundOn(s.sound);
  audio.setVoice(s.voice);
  if (window.speechSynthesis) window.speechSynthesis.addEventListener?.("voiceschanged", () => audio.setVoice(store.settings().voice));
  document.addEventListener("pointerdown", firstTouch, true);
  document.addEventListener("keydown", firstTouch, true);
  audio.setUseRecorded(s.recorded !== false);
  try {
    await Promise.all([loadCourse(), audio.loadManifest()]);
  } catch (e) {
    root.replaceChildren(h("div.screen.players", h("h1.title", "Knight School"),
      h("p.sub", "Couldn't load the lessons. Check the internet connection and reload the page.")));
    return;
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  app.show("players");
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

window.knightSchool = app;   // handy for testing
boot();
