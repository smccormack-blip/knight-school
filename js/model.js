// A small chess position model for showing lesson lines on the board.
// Squares are numbers 0..63 (a1 = 0, h1 = 7, a8 = 56). Pieces are "wN", "bQ", ...
// Lines in the lessons are lists of tokens: "e2e4" (a move; "e7e8q" promotes) or
// "~f6e4" (just move the piece there, whatever the rules say, and switch sides).
// This follows apply_token() in the Windows program.

export const FILES = "abcdefgh";
export const sqName = (s) => FILES[s & 7] + ((s >> 3) + 1);
export const parseSq = (n) => FILES.indexOf(n[0]) + 8 * (parseInt(n[1], 10) - 1);

export function fromFen(fen) {
  const [placement, turn = "w", castling = "-", ep = "-"] = (fen || "8/8/8/8/8/8/8/8 w - - 0 1").split(/\s+/);
  const board = new Array(64).fill(null);
  const rows = placement.split("/");
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r] || "") {
      if (/\d/.test(ch)) { f += parseInt(ch, 10); continue; }
      const color = ch === ch.toUpperCase() ? "w" : "b";
      board[(7 - r) * 8 + f] = color + ch.toUpperCase();
      f++;
    }
  }
  return { board, turn, castling: castling === "-" ? "" : castling, ep: ep === "-" ? null : parseSq(ep) };
}

export function toFen(pos) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = pos.board[r * 8 + f];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p[0] === "w" ? p[1] : p[1].toLowerCase();
    }
    rows.push(row + (empty || ""));
  }
  return `${rows.join("/")} ${pos.turn} ${pos.castling || "-"} ${pos.ep == null ? "-" : sqName(pos.ep)} 0 1`;
}

export const copyPos = (p) => ({ board: p.board.slice(), turn: p.turn, castling: p.castling, ep: p.ep });
export const placementKey = (p) => toFen(p).split(" ")[0];

// Play one move (from, to, promotion piece letter). Handles castling, en passant and
// promotion; everything else just moves the piece. Returns a new position.
export function playMove(pos, from, to, promo) {
  const p = copyPos(pos);
  const pc = p.board[from];
  if (!pc) { p.turn = p.turn === "w" ? "b" : "w"; return p; }
  const color = pc[0], kind = pc[1];
  const df = (to & 7) - (from & 7), dr = (to >> 3) - (from >> 3);
  if (kind === "P" && df !== 0 && !p.board[to] && to === pos.ep) {
    p.board[to - (color === "w" ? 8 : -8)] = null;              // en passant
  }
  if (kind === "K" && Math.abs(df) === 2 && dr === 0) {        // castling: bring the rook
    const rank = from & 56;
    const [rf, rt] = df > 0 ? [rank + 7, rank + 5] : [rank, rank + 3];
    if (p.board[rf] && p.board[rf][1] === "R") { p.board[rt] = p.board[rf]; p.board[rf] = null; }
  }
  p.board[to] = pc;
  p.board[from] = null;
  if (kind === "P" && ((to >> 3) === 7 || (to >> 3) === 0)) p.board[to] = color + (promo || "q").toUpperCase();
  p.ep = kind === "P" && Math.abs(dr) === 2 ? from + (dr > 0 ? 8 : -8) : null;
  if (kind === "K") p.castling = p.castling.replace(color === "w" ? /[KQ]/g : /[kq]/g, "");
  for (const [sq, right] of [[0, "Q"], [7, "K"], [56, "q"], [63, "k"]]) {
    if (from === sq || to === sq) p.castling = p.castling.replace(right, "");
  }
  p.turn = p.turn === "w" ? "b" : "w";
  return p;
}

// One line token: returns {pos, move: {from, to}}.
export function applyToken(pos, tok) {
  if (tok.startsWith("~")) {
    const from = parseSq(tok.slice(1, 3)), to = parseSq(tok.slice(3, 5));
    const p = copyPos(pos);
    const pc = p.board[from];
    p.board[from] = null;
    if (pc) p.board[to] = pc;
    p.turn = p.turn === "w" ? "b" : "w";
    p.ep = null;
    return { pos: p, move: { from, to } };
  }
  const from = parseSq(tok.slice(0, 2)), to = parseSq(tok.slice(2, 4));
  return { pos: playMove(pos, from, to, tok[4]), move: { from, to } };
}

// Squares the piece on `sq` attacks (up to and including the first piece in each line).
export function attacks(pos, sq) {
  const pc = pos.board[sq];
  if (!pc) return [];
  const f0 = sq & 7, r0 = sq >> 3, out = [];
  const add = (f, r) => { if (f >= 0 && f < 8 && r >= 0 && r < 8) { out.push(r * 8 + f); return true; } return false; };
  const ray = (df, dr) => {
    let f = f0 + df, r = r0 + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      out.push(r * 8 + f);
      if (pos.board[r * 8 + f]) break;
      f += df; r += dr;
    }
  };
  switch (pc[1]) {
    case "P": { const d = pc[0] === "w" ? 1 : -1; add(f0 - 1, r0 + d); add(f0 + 1, r0 + d); break; }
    case "N": for (const [a, b] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) add(f0 + a, r0 + b); break;
    case "K": for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) add(f0 + a, r0 + b); break;
    case "B": ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1); break;
    case "R": ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1); break;
    case "Q": ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1); ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1); break;
  }
  return out;
}

export function inCheck(pos) {
  const king = pos.board.indexOf(pos.turn + "K");
  if (king < 0) return null;
  for (let s = 0; s < 64; s++) {
    const p = pos.board[s];
    if (p && p[0] !== pos.turn && attacks(pos, s).includes(king)) return king;
  }
  return null;
}

// Enemy pieces (not pawns) attacked by the piece on sq: the targets of a fork.
export function forkTargets(pos, sq) {
  const pc = pos.board[sq];
  if (!pc) return [];
  return attacks(pos, sq).filter((t) => pos.board[t] && pos.board[t][0] !== pc[0] && pos.board[t][1] !== "P");
}
