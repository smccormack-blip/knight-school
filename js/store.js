// Players and their progress, kept in this browser (localStorage). Same rules as the
// Windows program, so progress codes mean the same thing on both.
import { makeCode } from "./progress_code.js";

const KEY = "knightschool.v1";
export const DEV_PASSWORD = "1111";

// ---------------------------------------------------------------- ranks
export const RANKS = [];
for (const [piece, name, pts] of [["P", "Pawn", [0, 20, 60, 115]], ["N", "Knight", [185, 260, 350, 445]],
  ["B", "Bishop", [555, 670, 790, 920]], ["R", "Rook", [1060, 1205, 1355, 1515]],
  ["Q", "Queen", [1680, 1850, 2025, 2210]], ["K", "King", [2400, 2595, 2795, 3000]]]) {
  [null, "Bronze", "Silver", "Gold"].forEach((tier, i) => {
    RANKS.push({ min: pts[i], piece, tier, name: tier ? `${tier} ${name}` : name });
  });
}
export const TIER_COLORS = { null: "#5B3FD1", Bronze: "#C77B30", Silver: "#A9B1BE", Gold: "#F2B705" };

export function rankIndex(points) {
  let k = 0;
  RANKS.forEach((r, i) => { if (points >= r.min) k = i; });
  return k;
}
export const rankOf = (points) => RANKS[rankIndex(points)];

// 5 on the first try, then 4, 3, 2, 1; each hint costs a point (never below 1);
// 1 after listening to the explanation first; 0 if the answer was shown.
export function puzzlePoints(state, answerShown = false) {
  if (answerShown) return 0;
  if (state.explained) return 1;
  return Math.max(1, 5 - (state.wrong || 0) - (state.hints || 0));
}

export const AVATARS = ["wN", "wQ", "wK", "wB", "wR", "wP", "bN", "bQ", "bK", "bB", "bR", "bP"];

// ---------------------------------------------------------------- saving
let data = null;

function load() {
  try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { data = null; }
  if (!data || !Array.isArray(data.players)) data = { players: [], next_id: 1 };
  data.settings = Object.assign({ sound: true, rate: 0.9, voice: "" }, data.settings || {});
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* full or blocked */ }
}
load();

export const players = () => data.players;
export const settings = () => data.settings;
export function saveSettings(patch) { Object.assign(data.settings, patch); save(); }
export const lastPlayerId = () => data.last_player;
export function setLastPlayer(id) { data.last_player = id; save(); }

export function addPlayer(name, avatar, progress = null) {
  const p = { id: data.next_id || 1, name, avatar, progress: progress || {} };
  data.next_id = p.id + 1;
  data.players.push(p);
  save();
  return p;
}
export function removePlayer(id) {
  data.players = data.players.filter((p) => p.id !== id);
  save();
}

export const normName = (n) => n.trim().split(/\s+/).join(" ").toLowerCase();
export const playerPoints = (p) => Object.values((p.progress || {}).points || {}).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- one player's progress
export class Progress {
  constructor(player) {
    this.player = player;
    const d = (player.progress = player.progress || {});
    d.solved = d.solved || [];
    d.heard = d.heard || [];
    d.listened = d.listened || {};
    this.d = d;
  }
  get name() { return this.player.name; }
  save() { save(); }
  solved(fig) { return this.d.solved.includes(fig); }
  mark(fig) { if (!this.solved(fig)) { this.d.solved.push(fig); save(); } }
  done(fig) { return this.d.heard.includes(fig) || this.d.solved.includes(fig); }

  // Highest page index this player may open.
  reachedIndex(flat) {
    if (!flat.length) return 0;
    const idx = flat.figIndex;
    let best = idx.get(this.d.reached) ?? 0;
    for (const f of this.d.heard) if (idx.has(f)) best = Math.max(best, idx.get(f) + 1);
    return Math.min(best, flat.length - 1);
  }
  complete(flat, i) {
    const fig = flat[i].fig;
    if (!this.d.heard.includes(fig)) this.d.heard.push(fig);
    const nxt = Math.min(i + 1, flat.length - 1);
    if (nxt > this.reachedIndex(flat) || this.d.reached == null) this.d.reached = flat[nxt].fig;
    save();
  }
  get points() { return Object.values(this.d.points || {}).reduce((a, b) => a + b, 0); }
  award(fig, pts) {
    const pd = (this.d.points = this.d.points || {});
    if (!(fig in pd)) {
      pd[fig] = pts;
      if (this.d.pz) delete this.d.pz[fig];
      save();
    }
  }
  puzzleState(fig) {
    const pz = (this.d.pz = this.d.pz || {});
    return (pz[fig] = pz[fig] || { wrong: 0, hints: 0, explained: false });
  }
  listened(fig) { return this.d.listened[fig] || 0; }
  noteListened(fig, i) { if (i > (this.d.listened[fig] || 0)) this.d.listened[fig] = i; }
  code(flat) {
    const fig = flat.length ? flat[this.reachedIndex(flat)].fig : "2.1.1.1";
    return makeCode(this.name, this.player.avatar || "wN", fig, this.points);
  }
}

// ---------------------------------------------------------------- progress codes
const figKey = (fig) => String(fig).split(".").map(Number);
const figLess = (a, b) => {
  const x = figKey(a), y = figKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) < (y[i] ?? -1);
  }
  return false;
};

// Where a code's furthest page falls in this course (or the first page after it).
export function codeIndex(flat, fig) {
  return Math.min(flat.filter((p) => figLess(p.fig, fig)).length, Math.max(0, flat.length - 1));
}

// A fresh progress record from a decoded code: every page before the furthest page counts
// as done, and the points come over as one total.
export function progressFromCode(info, flat, keep = null) {
  const idx = codeIndex(flat, info.reached);
  const before = flat.slice(0, idx);
  return {
    solved: before.filter((p) => p.playable).map((p) => p.fig),
    heard: before.map((p) => p.fig), listened: {}, pz: {},
    points: info.points ? { _from_code: info.points } : {},
    reached: flat.length ? flat[idx].fig : null,
    quiz_narration: keep && "quiz_narration" in keep ? keep.quiz_narration : true,
  };
}
