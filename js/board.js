// The chess board on screen: squares, pieces, circles and arrows, animation, and
// moving pieces by dragging or by tapping the piece and then the square.
import { forkTargets, inCheck, placementKey } from "./model.js";

const LIGHT = "#EEEED2", DARK = "#769656", LAST = "#F2E86D", SEL = "#F6C445";
const HINT = "#FF9F1C", BAD = "#E5484D", INK = "#1F2340";
const SVGNS = "http://www.w3.org/2000/svg";

export function mix(c1, c2, t) {
  const a = [1, 3, 5].map((i) => parseInt(c1.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(c2.slice(i, i + 2), 16));
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

const pieceUrl = (p) => `img/pieces/${p}.png`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Board {
  constructor(el, { onMove, legalTargets, sound } = {}) {
    this.el = el;
    this.onMove = onMove || (() => {});
    this.legalTargets = legalTargets || (() => null);
    this.sound = sound || (() => {});
    this.pos = null;
    this.flipped = false;
    this.interactive = false;
    this.busy = false;
    this.lastMove = null;
    this.selected = null;
    this.hintFrom = null;
    this.hintTo = null;
    this.marks = [];
    this.marksKey = null;
    this.hide = null;
    this.attackFrom = [];
    el.classList.add("board");
    el.innerHTML = "";
    this.sqLayer = document.createElement("div");
    this.sqLayer.className = "squares";
    this.svg = document.createElementNS(SVGNS, "svg");
    this.svg.setAttribute("viewBox", "0 0 8 8");
    this.svg.setAttribute("class", "overlay");
    this.pcLayer = document.createElement("div");
    this.pcLayer.className = "pieces";
    this.top = document.createElementNS(SVGNS, "svg");
    this.top.setAttribute("viewBox", "0 0 8 8");
    this.top.setAttribute("class", "overlay top");
    this.fx = document.createElement("div");
    this.fx.className = "fx";
    this.squares = [];
    for (let i = 0; i < 64; i++) {
      const d = document.createElement("div");
      d.className = "sq";
      this.sqLayer.appendChild(d);
      this.squares.push(d);
    }
    el.append(this.sqLayer, this.svg, this.pcLayer, this.top, this.fx);
    el.addEventListener("pointerdown", (e) => this._down(e));
    el.addEventListener("pointermove", (e) => this._move(e));
    el.addEventListener("pointerup", (e) => this._up(e));
    el.addEventListener("pointercancel", () => this._cancel());
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // --- geometry: display cell (col, row from top-left) for a square
  cell(sq) {
    const f = sq & 7, r = sq >> 3;
    return this.flipped ? [7 - f, r] : [f, 7 - r];
  }
  sqAt(clientX, clientY) {
    const b = this.sqLayer.getBoundingClientRect();
    const c = Math.floor(((clientX - b.left) / b.width) * 8), r = Math.floor(((clientY - b.top) / b.height) * 8);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    return this.flipped ? r * 8 + (7 - c) : (7 - r) * 8 + c;
  }

  setPosition(pos, interactive = false) {
    this.pos = pos;
    this.interactive = interactive;
    this.selected = null;
    this.drag = null;
    this.render();
  }

  render() {
    const pos = this.pos;
    // squares (with coordinates inside the edge squares)
    for (let sq = 0; sq < 64; sq++) {
      const [c, r] = this.cell(sq);
      const d = this.squares[r * 8 + c];
      const dark = ((sq & 7) + (sq >> 3)) % 2 === 0;
      let col = dark ? DARK : LIGHT;
      if (this.lastMove && (sq === this.lastMove.from || sq === this.lastMove.to)) col = mix(col, LAST, 0.55);
      if (sq === this.selected) col = mix(col, SEL, 0.7);
      d.style.background = col;
      let html = "";
      if (r === 7) html += `<span class="cf" style="color:${dark ? LIGHT : DARK}">${"abcdefgh"[sq & 7]}</span>`;
      if (c === 0) html += `<span class="cr" style="color:${dark ? LIGHT : DARK}">${(sq >> 3) + 1}</span>`;
      d.innerHTML = html;
    }
    // overlay: check glow, hints, the book's circles, legal-move dots
    const svg = this.svg;
    svg.innerHTML = "";
    if (!pos) { this.pcLayer.innerHTML = ""; return; }
    const at = (sq) => this.cell(sq);
    const king = inCheck(pos);
    if (king != null) {
      const [c, r] = at(king);
      svg.insertAdjacentHTML("beforeend",
        `<defs><radialGradient id="chk"><stop offset="0" stop-color="${BAD}" stop-opacity=".95"/><stop offset=".8" stop-color="${BAD}" stop-opacity=".25"/><stop offset="1" stop-color="${BAD}" stop-opacity="0"/></radialGradient></defs>` +
        `<circle cx="${c + 0.5}" cy="${r + 0.5}" r=".5" fill="url(#chk)"/>`);
    }
    if (this.hintFrom != null) {
      const [c, r] = at(this.hintFrom);
      svg.insertAdjacentHTML("beforeend", `<circle cx="${c + 0.5}" cy="${r + 0.5}" r=".44" fill="none" stroke="${HINT}" stroke-width=".08"/>`);
    }
    if (this.hintTo != null) {
      const [c, r] = at(this.hintTo);
      svg.insertAdjacentHTML("beforeend", `<circle cx="${c + 0.5}" cy="${r + 0.5}" r=".4" fill="none" stroke="${HINT}" stroke-width=".07" stroke-dasharray=".14 .09"/>`);
    }
    if (this.marks.length && placementKey(pos) === this.marksKey) {
      for (const m of this.marks) {
        if (!/^[a-h][1-8]$/.test(m.sq || "")) continue;
        const [c, r] = at("abcdefgh".indexOf(m.sq[0]) + 8 * (parseInt(m.sq[1], 10) - 1));
        const x = c + 0.5, y = r + 0.5;
        if (m.shape === "x") {
          const a = 0.22;
          for (const [w, col] of [[0.14, INK], [0.07, "white"]]) {
            svg.insertAdjacentHTML("beforeend",
              `<path d="M${x - a} ${y - a}L${x + a} ${y + a}M${x - a} ${y + a}L${x + a} ${y - a}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`);
          }
        } else {
          svg.insertAdjacentHTML("beforeend",
            `<circle cx="${x}" cy="${y}" r=".2" fill="${m.fill === "w" ? "white" : INK}" stroke="${INK}" stroke-width=".04"/>`);
        }
      }
    }
    if (this.selected != null) {
      for (const t of this.legalTargets(this.selected) || []) {
        const [c, r] = at(t);
        svg.insertAdjacentHTML("beforeend", pos.board[t]
          ? `<circle cx="${c + 0.5}" cy="${r + 0.5}" r=".45" fill="none" stroke="#2b2b2b" stroke-opacity=".45" stroke-width=".07"/>`
          : `<circle cx="${c + 0.5}" cy="${r + 0.5}" r=".15" fill="#2b2b2b" fill-opacity=".4"/>`);
      }
    }
    // pieces
    this.pcLayer.innerHTML = "";
    for (let sq = 0; sq < 64; sq++) {
      const p = pos.board[sq];
      if (!p || sq === this.hide || (this.drag && this.drag.from === sq && this.drag.moved)) continue;
      this.pcLayer.appendChild(this._pieceImg(p, sq));
    }
    this._drawAttacks();
  }

  _pieceImg(p, sq) {
    const img = document.createElement("img");
    img.src = pieceUrl(p);
    img.className = "pc";
    img.draggable = false;
    img.alt = "";
    const [c, r] = this.cell(sq);
    img.style.left = c * 12.5 + "%";
    img.style.top = r * 12.5 + "%";
    return img;
  }

  // --- the red arrows and circles of a fork
  showAttacks(sq) {
    const n = forkTargets(this.pos, sq).length;
    if (n) { this.attackFrom.push(sq); this._drawAttacks(); }
    return n;
  }
  clearAttacks() { this.attackFrom = []; this._drawAttacks(); }
  _drawAttacks() {
    const svg = this.top;
    svg.innerHTML = `<defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0L10 5L0 10z" fill="${BAD}"/></marker></defs>`;
    if (!this.pos) return;
    for (const sq of this.attackFrom) {
      const [c0, r0] = this.cell(sq);
      for (const t of forkTargets(this.pos, sq)) {
        const [c, r] = this.cell(t);
        const dx = c - c0, dy = r - r0, len = Math.hypot(dx, dy);
        const ex = c + 0.5 - (dx / len) * 0.42, ey = r + 0.5 - (dy / len) * 0.42;
        svg.insertAdjacentHTML("beforeend",
          `<line x1="${c0 + 0.5}" y1="${r0 + 0.5}" x2="${ex}" y2="${ey}" stroke="${BAD}" stroke-width=".085" stroke-opacity=".85" marker-end="url(#ah)"/>` +
          `<circle cx="${c + 0.5}" cy="${r + 0.5}" r=".45" fill="none" stroke="${BAD}" stroke-width=".08"/>`);
      }
    }
  }

  // --- animation
  // Slide one piece from `before` to `after` (or back again when reverse is true).
  async animateStep(before, after, move, { reverse = false, ms = 400 } = {}) {
    const mover = reverse ? after.board[move.to] : before.board[move.from];
    if (!mover) {
      this.pos = reverse ? before : after;
      this.render();
      return;
    }
    this.busy = true;
    this.pos = before;
    this.hide = move.from;
    this.render();
    const [src, dst] = reverse ? [move.to, move.from] : [move.from, move.to];
    const img = this._pieceImg(mover, src);
    img.classList.add("floating");
    this.pcLayer.appendChild(img);
    const [c1, r1] = this.cell(src), [c2, r2] = this.cell(dst);
    const dx = (c2 - c1) * 100, dy = (r2 - r1) * 100;
    const anim = img.animate([
      { transform: "translate(0,0)" },
      { transform: `translate(${dx / 2}%, ${dy / 2 - 12}%)`, offset: 0.5 },
      { transform: `translate(${dx}%, ${dy}%)` },
    ], { duration: ms, easing: "ease-in-out", fill: "forwards" });
    await anim.finished.catch(() => {});
    this.hide = null;
    this.pos = reverse ? before : after;
    this.lastMove = reverse ? null : move;
    this.busy = false;
    this.render();
    this.sound(reverse ? "tick" : "move");
  }

  flash(sq, color, ms = 600) {
    const [c, r] = this.cell(sq);
    const d = document.createElement("div");
    d.className = "flash";
    d.style.cssText = `left:${c * 12.5}%;top:${r * 12.5}%;border-color:${color}`;
    this.fx.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  callout(title, subtitle = "", color = "#FF9F1C", hold = 1100) {
    this.fx.querySelectorAll(".callout").forEach((n) => n.remove());
    const d = document.createElement("div");
    d.className = "callout";
    d.innerHTML = `<div class="burst" style="background:${color}"><b>${title}</b>${subtitle ? `<small>${subtitle}</small>` : ""}</div>`;
    this.fx.appendChild(d);
    setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 400); }, hold);
  }
  clearCallout() { this.fx.querySelectorAll(".callout").forEach((n) => n.remove()); }

  banner(text, color, ms = 1700) {
    const d = document.createElement("div");
    d.className = "banner";
    d.style.background = color;
    d.textContent = text;
    this.fx.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  confetti(n = 70) {
    const cols = ["#FF9F1C", "#22B573", "#7B5CFF", "#E5484D", "#F2B705", "#1D5FD6"];
    for (let i = 0; i < n; i++) {
      const d = document.createElement("i");
      d.className = "confetti";
      d.style.left = Math.random() * 100 + "%";
      d.style.background = cols[i % cols.length];
      const x = (Math.random() - 0.5) * 120, rot = Math.random() * 720 - 360;
      this.fx.appendChild(d);
      d.animate([{ transform: "translate(0,-20px) rotate(0)" },
        { transform: `translate(${x}px, ${this.el.clientHeight + 40}px) rotate(${rot}deg)` }],
      { duration: 1400 + Math.random() * 900, delay: Math.random() * 300, easing: "cubic-bezier(.3,.1,.7,1)", fill: "forwards" })
        .finished.then(() => d.remove());
    }
  }

  starBurst(n = 14, big = false) {
    for (let i = 0; i < n; i++) {
      const d = document.createElement("i");
      d.className = "star" + (big ? " big" : "");
      d.textContent = "★";
      this.fx.appendChild(d);
      const a = (i / n) * Math.PI * 2, dist = (big ? 0.48 : 0.38) * this.el.clientWidth;
      d.animate([{ transform: "translate(-50%,-50%) scale(.2)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist}px)) scale(1.2) rotate(180deg)`, opacity: 0 }],
      { duration: 1100 + (big ? 400 : 0), easing: "ease-out", fill: "forwards" }).finished.then(() => d.remove());
    }
  }

  // Five points: a big knight charges across with stars behind it.
  async knightCharge() {
    const d = document.createElement("img");
    d.src = pieceUrl("wN");
    d.className = "charger";
    this.fx.appendChild(d);
    this.starBurst(18, true);
    await d.animate([{ transform: "translate(-120%, 0) rotate(-10deg)" }, { transform: "translate(0%, -15%) rotate(8deg)", offset: 0.5 },
      { transform: "translate(120%, 0) rotate(-6deg)" }], { duration: 1500, easing: "ease-in-out" }).finished.catch(() => {});
    d.remove();
    this.banner("★ 5 POINTS! ★", "#7B5CFF", 1200);
    await wait(900);
  }

  // --- input: drag a piece, or tap it and then tap where it should go
  _down(e) {
    if (!this.interactive || this.busy || !this.pos) return;
    const sq = this.sqAt(e.clientX, e.clientY);
    if (sq == null) return;
    e.preventDefault();
    const p = this.pos.board[sq];
    const own = p && p[0] === this.pos.turn;
    if (this.selected != null && sq !== this.selected && !own) {
      const from = this.selected;
      this.selected = null;
      this._attempt(from, sq, true);
      return;
    }
    if (own) {
      this.selected = sq;
      this.drag = { from: sq, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
      try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
      this.render();
    } else if (this.selected != null) {
      this.selected = null;
      this.render();
    }
  }
  _move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const b = this.sqLayer.getBoundingClientRect();
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < b.width / 40) return;
    if (!d.moved) {
      d.moved = true;
      this.render();
      d.img = document.createElement("img");
      d.img.src = pieceUrl(this.pos.board[d.from]);
      d.img.className = "pc dragging";
      this.pcLayer.appendChild(d.img);
    }
    d.img.style.left = `calc(${((e.clientX - b.left) / b.width) * 100}% - 6.25%)`;
    d.img.style.top = `calc(${((e.clientY - b.top) / b.height) * 100}% - 9%)`;
  }
  _up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.img) d.img.remove();
    if (!d.moved) { this.render(); return; }      // a tap: keep the piece selected
    const sq = this.sqAt(e.clientX, e.clientY);
    this.selected = null;
    if (sq != null && sq !== d.from) this._attempt(d.from, sq, false);
    else this.render();
  }
  _cancel() {
    if (this.drag && this.drag.img) this.drag.img.remove();
    this.drag = null;
    this.render();
  }
  _attempt(from, to, animate) {
    const legal = this.legalTargets(from);
    if (legal && !legal.includes(to)) { this.render(); return; }
    this.onMove(from, to, animate);
  }
}
