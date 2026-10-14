// The lesson screen: Learn mode (walk through the pages in order) and the Quizzer
// (random puzzles). Follows LessonScreen in the Windows program.
import { Board } from "./board.js";
import { applyToken, fromFen, toFen, playMove, parseSq, sqName, placementKey, forkTargets } from "./model.js";
import { Chess } from "./chess.js";
import * as audio from "./audio.js";
import { course, page, prefetch } from "./course.js";
import { RANKS, rankIndex, rankOf, puzzlePoints } from "./store.js";
import { h, badge, ask } from "./ui.js";

const PAUSE_AFTER_MOVE = 1000;
const C = { header: "#5B3FD1", header2: "#7B5CFF", accent: "#FF9F1C", good: "#22B573", bad: "#E5484D", ink: "#1F2340" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Lesson {
  constructor(app, mode, startIndex = 0) {
    this.app = app;
    this.mode = mode;
    this.flat = course.flat;
    this.narr = null;
    this.narrGen = 0;
    this.loadGen = 0;
    this.timer = null;
    this.curLine = [];
    if (mode === "quiz") {
      this.order = this.flat.filter((p) => p.playable).map((p) => p.flatIndex);
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
      this.qpos = 0;
      this.score = 0;
      this.streak = 0;
    }
    this.build();
    this.load(mode === "quiz" ? this.order[0] : startIndex);
  }

  get progress() { return this.app.progress; }
  get dev() { return this.app.dev; }

  // ------------------------------------------------------------ layout
  build() {
    const q = this.mode === "quiz";
    this.badgeBox = h("div.who");
    this.el = h("div.screen.lesson",
      h("header.bar",
        h("button.btn.small.home", { onclick: () => this.goHome(), "aria-label": "Home" }, "⌂"),
        this.badgeBox,
        this.titleEl = h("div.bar-title"),
        h("button.btn.small.icon", { onclick: () => this.flip(), title: "Turn the board around", "aria-label": "Flip the board" }, "⇅"),
        h("button.btn.small.icon", { onclick: () => this.app.settingsDialog(), "aria-label": "Settings" }, "⚙")),
      h("main.lesson-main",
        this.boardWrap = h("div.board-wrap", this.boardEl = h("div")),
        h("div.panel",
          h("div.counter-row", this.counterEl = h("div.counter"), this.statusEl = h("div.status")),
          h("div.say", h("img", { src: "img/pieces/wN.png", alt: "" }), this.sayEl = h("span")),
          this.tools = h("div.tools",
            this.explainBtn = h("button.btn.small.purple", { onclick: () => this.reveal() }, q ? "Show answer" : "Explain"),
            this.hintBtn = h("button.btn.small.orange", { onclick: () => this.hint() }, "Hint"),
            this.tryBtn = h("button.btn.small.grey", { onclick: () => this.tryAgain() }, "Start over"),
            q ? (this.narrToggle = h("button.btn.small.grey", { onclick: () => this.toggleQuizNarration() })) : null),
          this.narrBar = h("div.narrbar.hidden",
            h("div.row",
              this.narrLbl = h("span.narr-lbl"),
              this.partLbl = h("span.part"),
              h("span.grow"),
              this.skipBtn = h("button.btn.small.grey", { onclick: () => this.skipNarration() }, "Skip ⏭"),
              this.pauseBtn = h("button.btn.small.purple", { onclick: () => this.togglePause() }, "❚❚ Pause"),
              this.againBtn = h("button.btn.small.purple", { onclick: () => this.startNarration({ replay: true }) }, "↻ Hear it again")),
            this.scrub = h("input.scrub", { type: "range", min: 0, max: 0, step: 1, value: 0 })),
          this.lineBar = h("div.linebar.hidden",
            this.lineLbl = h("span.line-lbl"),
            h("span.grow"),
            h("button.btn.small.grey", { onclick: () => this.lineStep(-1), "aria-label": "Back one move" }, "◀"),
            h("button.btn.small.grey", { onclick: () => this.lineStep(1), "aria-label": "Forward one move" }, "▶"),
            h("button.btn.small.grey", { onclick: () => this.backToStart() }, "Start")),
          this.textEl = h("div.text"))),
      h("footer.nav",
        this.prevBtn = h("button.btn.nav-btn", { onclick: () => this.prev() }, "◀ Prev"),
        q ? h("div.quiz-score.grow", this.scoreEl = h("span"))
          : (this.topicSel = h("select.topics", { onchange: () => this.topicChosen() })),
        this.nextBtn = h("button.btn.nav-btn.next", { onclick: () => this.next() }, q ? "Next puzzle ▶" : "Next ▶")));
    if (q) this.prevBtn.style.visibility = "hidden";
    this.scrub.addEventListener("input", () => {
      const segs = this.segments();
      this.partLbl.textContent = `Part ${+this.scrub.value + 1} of ${segs.length}`;
    });
    this.scrub.addEventListener("change", () => { if (this.narr && this.narr.playing) this.seek(+this.scrub.value); });
    this.textEl.addEventListener("click", (e) => this.textClicked(e));
    this.board = new Board(this.boardEl, {
      onMove: (from, to, animate) => this.userMove(from, to, animate),
      legalTargets: (sq) => this.legalTargets(sq),
      sound: (n) => audio.play(n),
    });
    this.keys = (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft") this.prev();
      else if (e.key === "ArrowRight") this.next();
    };
    document.addEventListener("keydown", this.keys);
    this.resize = () => this.fitBoard();
    window.addEventListener("resize", this.resize);
    this.drawBadge(this.mode === "learn" ? this.progress.points : 0);
  }

  mount(root) {
    root.append(this.el);
    this.fitBoard();
    requestAnimationFrame(() => this.fitBoard());
  }

  destroy() {
    this.stopNarration();
    this.loadGen++;
    document.removeEventListener("keydown", this.keys);
    window.removeEventListener("resize", this.resize);
    this.el.remove();
  }

  // The board is as big as fits: on top in portrait, at the left in landscape.
  fitBoard() {
    const main = this.el.querySelector(".lesson-main");
    if (!main) return;
    const W = main.clientWidth, H = main.clientHeight;
    const landscape = W > H * 1.15 && W >= 560;
    this.el.classList.toggle("landscape", landscape);
    let size;
    if (this.noBoard) size = 0;
    else if (landscape) size = Math.min(H - 16, W * 0.58);
    else size = Math.min(W - 16, H * 0.52);
    size = Math.max(0, Math.floor(size / 8) * 8);
    this.boardWrap.style.width = size + "px";
    this.boardWrap.style.height = size + "px";
  }

  drawBadge(points, bump = false) {
    const rank = rankOf(points);
    this.badgeBox.replaceChildren(badge(rank, 40),
      h("div.who-text", h("b", this.progress.name),
        h("span" + (bump ? ".bump" : ""), this.mode === "learn" ? `${rank.name} · ${points} pts` : `${rank.name}`)));
    this.badgeBox.onclick = null;
  }

  say(text) {
    this.sayEl.textContent = text;
    this.sayEl.parentElement.classList.remove("pop");
    void this.sayEl.offsetWidth;
    this.sayEl.parentElement.classList.add("pop");
  }
  status(text, color = C.ink) {
    this.statusEl.textContent = text;
    this.statusEl.style.color = color;
  }

  // ------------------------------------------------------------ loading a page
  async load(idx) {
    this.stopNarration(true);
    const gen = ++this.loadGen;
    this.idx = idx;
    let pos;
    try {
      pos = await page(idx);
    } catch (e) {
      this.status("Couldn't load this lesson. Check the internet connection and try again.", C.bad);
      return;
    }
    if (gen !== this.loadGen) return;
    prefetch(idx + 1);
    this.pos = pos;
    this.revealed = false;
    this.solvedNow = false;
    this.hints = 0;
    this.hintWarned = false;
    this.answerShown = false;
    this.showing = null;
    this.board.hintFrom = this.board.hintTo = null;
    if (this.mode === "learn" && pos.playable && !this.progress.solved(pos.fig)) this.pz = this.progress.puzzleState(pos.fig);
    else this.pz = { wrong: 0, hints: 0, explained: false };
    this.firstSolve = this.mode === "quiz" || !this.progress.solved(pos.fig);
    this.board.flipped = !!pos.flipped;
    this.start = fromFen(pos.fen);
    this.noBoard = !pos.fen;
    this.boardWrap.classList.toggle("hidden", this.noBoard);
    this.fitBoard();
    this.sideName = this.start.turn === "w" ? "White" : "Black";
    this.fullText = (pos.paragraphs || []).map((p) => p.map((r) => r.t).join("")).join("\n") + "\n";
    if (this.mode === "learn") {
      this.titleEl.textContent = `${pos.sectionTitle} › ${pos.topicTitle}`;
      this.updateCounter();
      for (const b of [this.explainBtn, this.hintBtn, this.tryBtn]) b.classList.toggle("hidden", !pos.playable);
      this.tools.classList.toggle("hidden", !pos.playable);
    } else {
      this.titleEl.textContent = `Quizzer › Puzzle ${this.qpos + 1}`;
      this.counterEl.textContent = "Find the best move!";
      this.updateScore();
      this.updateQuizNarrBtn();
    }
    this.reset(true);
    this.updateNav();
    this.textEl.scrollTop = 0;
    if (!pos.playable) {
      if (this.segments().length) {
        setTimeout(() => { if (this.loadGen === gen && !this.narr) this.startNarration(); }, 500);
      } else this.completePage();
    }
  }

  updateCounter() {
    if (this.mode !== "learn") return;
    const p = this.pos;
    this.counterEl.textContent = `Figure ${p.fig} (${p.inTopic + 1} of ${p.topicSize})${this.progress.solved(p.fig) ? " ★" : ""}`;
  }
  updateScore() {
    if (this.mode === "quiz") this.scoreEl.textContent = `Score ${this.score} · Streak ${this.streak}`;
  }
  worthText() {
    if (!this.firstSolve) return " · already solved";
    if (this.mode === "quiz") return "";
    const p = puzzlePoints(this.pz);
    return ` · worth ${p} point${p === 1 ? "" : "s"}`;
  }

  reset(first = false) {
    const pos = this.pos;
    this.ply = 0;
    this.active = (pos.solution || []).slice();
    this.lineBar.classList.add("hidden");
    this.curLine = [];
    this.showing = null;
    this.board.lastMove = null;
    this.board.attackFrom = [];
    this.textEl.querySelectorAll(".current").forEach((n) => n.classList.remove("current"));
    const interactive = pos.playable && !this.solvedNow && !(this.narr && this.narr.playing);
    this.board.marks = pos.marks || [];
    this.board.marksKey = placementKey(this.start);
    this.board.setPosition(this.start, interactive);
    if (pos.playable) {
      if (this.solvedNow) this.status("Solved! Tap the blue moves to see them again.", C.good);
      else this.status(`${this.sideName} to move${this.worthText()}`);
      if (first && !this.solvedNow) setTimeout(() => this.yourMove(), 350);
      if (first) {
        this.say(this.mode === "learn" ? pick([`${this.sideName} to move. Find the winning move! Drag a piece, or tap it and then tap where it goes.`,
          `${this.sideName} to move. Look for a move that attacks two things at once!`,
          `${this.sideName} to move. What's the best move here?`])
          : `Puzzle time! ${this.sideName} to move. Stuck? Press Hint.`);
      }
    } else {
      this.status(pos.fen ? "Listen and watch the board" : "Listen along");
      this.skeletalForks();
      if (first) this.say("Listen to Professor Farnsworth. Watch the board: the pieces move as he explains.");
    }
    if (first) this.fillText(!pos.playable);
  }

  // In an example position, point out any knight that's already forking two pieces.
  skeletalForks() {
    if (this.pos.playable || !this.board.pos) return;
    const b = this.board.pos;
    for (let sq = 0; sq < 64; sq++) {
      if (b.board[sq] && b.board[sq][1] === "N" && forkTargets(b, sq).length >= 2) this.board.showAttacks(sq);
    }
  }

  tryAgain() {
    if (this.narr && this.narr.playing) return;
    this.reset();
    if (this.pos.playable && !this.solvedNow) this.yourMove();
  }
  backToStart() { this.tryAgain(); }

  yourMove(again = false) {
    if (this.solvedNow || !this.pos.playable || (this.narr && this.narr.playing)) return;
    if (again) {
      this.board.callout("YOUR MOVE!", "Keep going!", C.header2, 700);
      audio.play("again");
    } else {
      this.board.callout("YOUR MOVE!", this.start.turn === "w" ? "You are White" : "You are Black", C.accent);
      audio.play("yourmove");
    }
  }

  // The lesson text. Every piece of text knows which sentence of the narration it is
  // part of (so it can light up while it's read), and moves are tappable links.
  fillText(reveal) {
    const t = this.textEl;
    t.replaceChildren();
    if (!reveal) {
      t.append(h("p.bignote", "Your turn!"),
        h("p.note", `Try to find the best move for ${this.sideName} by moving a piece on the board. A wrong move just puts the pieces back, so you can try again.`),
        h("p.note", this.mode === "learn" ? "If you get stuck, press Hint for a clue, or Explain to hear Professor Farnsworth's explanation."
          : "Press Hint for a clue, or Show answer to see the solution."), this.credit());
      return;
    }
    this.revealed = true;
    const segs = this.segments();
    const cuts = new Set();
    for (const s of segs) { cuts.add(s.a); cuts.add(s.b); }
    const segAt = (o) => segs.findIndex((s) => s.a <= o && o < s.b);
    let off = 0;
    for (const para of this.pos.paragraphs || []) {
      const p = h("p");
      for (const run of para) {
        const holder = run.move ? h("a.move", { "data-move": run.move }) : null;
        const cls = run.s === "i" || run.s === "b" || run.s === "bi" ? run.s : run.s ? "i" : "";
        let start = 0;
        const txt = run.t;
        for (let k = 1; k <= txt.length; k++) {
          if (k === txt.length || cuts.has(off + k)) {
            const piece = txt.slice(start, k);
            const sp = h("span" + (cls ? "." + cls : ""), piece);
            const si = segAt(off + start);
            if (si >= 0) sp.dataset.seg = si;
            (holder || p).append(sp);
            start = k;
          }
        }
        if (holder) p.append(holder);
        off += txt.length;
      }
      off += 1; // the line break after each paragraph
      t.append(p);
    }
    t.append(this.credit());
  }
  credit() {
    return h("p.foot", "From ", h("i", "Predator at the Chessboard"), " by Ward Farnsworth (",
      h("a", { href: "https://www.chesstactics.org", target: "_blank", rel: "noopener" }, "chesstactics.org"), "), CC BY-NC-ND 2.5");
  }

  reveal() {
    if (this.narr && this.narr.playing) return;
    if (this.mode === "quiz") { this.showAnswer(); return; }
    if (this.pos.playable && !this.solvedNow && this.firstSolve && !this.pz.explained && puzzlePoints(this.pz) > 1) {
      ask("Listen to the explanation?", "If you listen to the explanation now, solving this puzzle will only earn 1 point. Listen anyway?")
        .then((yes) => { if (yes) this.revealConfirmed(); });
      return;
    }
    this.revealConfirmed();
  }
  revealConfirmed() {
    if (this.pos.playable && !this.solvedNow && this.firstSolve) {
      this.pz.explained = true;
      if (this.mode === "learn") this.progress.save();
    }
    if (!this.revealed) this.fillText(true);
    this.say("Here's Professor Farnsworth's explanation. Watch the board as he talks!");
    this.startNarration({ onEnd: () => this.afterExplain() });
  }
  afterExplain() {
    if (this.solvedNow) return;
    this.say("Now you try! Find the move on the board.");
    this.reset();
    this.yourMove();
  }

  // ------------------------------------------------------------ lines of moves on the board
  boards(tokens) {
    const bs = [this.start], ms = [];
    for (const t of tokens) {
      const { pos, move } = applyToken(bs[bs.length - 1], t);
      bs.push(pos);
      ms.push(move);
    }
    return [bs, ms];
  }

  // Animate from the line on the board now to `line`, taking moves back first if needed.
  async gotoLine(line, { fork = null, gen = null, fast = false } = {}) {
    const cur = this.curLine;
    let k = 0;
    while (k < cur.length && k < line.length && cur[k] === line[k]) k++;
    const [cb, cm] = this.boards(cur), [nb, nm] = this.boards(line);
    const steps = [];
    for (let j = cur.length - 1; j >= k; j--) steps.push(["back", cb[j + 1], cb[j], cm[j]]);
    for (let j = k; j < line.length; j++) steps.push(["fwd", nb[j], nb[j + 1], nm[j]]);
    const bv = this.board;
    bv.clearAttacks();
    bv.interactive = false;
    if (steps.some((s) => s[0] === "back")) audio.play("rewind");
    const [fwdMs, backMs] = fast ? [200, 160] : [430, 300];
    const stale = () => gen != null && gen !== this.narrGen;
    const token = (this.lineToken = (this.lineToken || 0) + 1);
    for (const [kind, before, after, mv] of steps) {
      if (stale() || token !== this.lineToken) return false;
      if (kind === "back") { await bv.animateStep(before, after, mv, { reverse: true, ms: backMs }); await wait(60); }
      else { await bv.animateStep(before, after, mv, { ms: fwdMs }); await wait(90); }
    }
    if (stale() || token !== this.lineToken) return false;
    this.curLine = line.slice();
    bv.pos = nb[nb.length - 1];
    bv.lastMove = nm.length ? nm[nm.length - 1] : null;
    bv.attackFrom = [];
    bv.render();
    let sq = null;
    if (fork) sq = parseSq(fork);
    else if (nm.length && steps.length && steps[steps.length - 1][0] === "fwd") {
      const to = nm[nm.length - 1].to;
      if (bv.pos.board[to] && bv.pos.board[to][1] === "N") sq = to;
    }
    if (sq != null) bv.showAttacks(sq);
    if (!line.length) this.skeletalForks();
    return true;
  }

  // ------------------------------------------------------------ narration
  segments() { return (this.pos && this.pos.segments) || []; }
  quizNarrationOn() { return this.mode !== "quiz" || this.progress.d.quiz_narration !== false; }
  reached() { return this.dev ? this.flat.length - 1 : this.progress.reachedIndex(this.flat); }
  canOpen(i) { return i >= 0 && i < this.flat.length && (this.dev || i <= this.reached()); }

  updateNav() {
    const playing = !!(this.narr && this.narr.playing);
    if (this.mode === "learn") {
      this.prevBtn.disabled = this.idx <= 0;
      const can = this.canOpen(this.idx + 1);
      this.nextBtn.classList.toggle("locked", !can);
      this.nextBtn.classList.toggle("ready", can && this.idx + 1 < this.flat.length && this.progress.done(this.pos.fig));
      this.fillTopics();
    }
    for (const b of [this.explainBtn, this.hintBtn, this.tryBtn]) b.disabled = playing;
  }

  fillTopics() {
    const sel = this.topicSel;
    const sec = course.sections.find((s) => s.section === this.pos.section);
    sel.replaceChildren(...sec.topics.map((t) => {
      const open = this.canOpen(t.first);
      return h("option", { value: t.first, disabled: !open }, `${open ? "" : "🔒 "}${t.num}  ${t.title}`);
    }));
    sel.value = String(sec.topics.find((t) => t.index === this.pos.topic).first);
  }
  topicChosen() {
    const first = +this.topicSel.value;
    if (!this.canOpen(first)) { this.say("That lesson is still locked. Keep going and you'll get there!"); this.fillTopics(); return; }
    this.load(first);
  }

  completePage() {
    if (this.mode === "learn") {
      this.progress.complete(this.flat, this.idx);
      this.updateNav();
    }
  }

  startNarration({ replay = false, from = 0, onEnd = null } = {}) {
    const segs = this.segments();
    if (!segs.length || !this.quizNarrationOn()) { if (onEnd) onEnd(); return; }
    this.stopNarration();
    const gen = ++this.narrGen;
    this.narr = { i: from, replay, onEnd, playing: true, paused: false, pending: null, resumeAt: null };
    this.lineBar.classList.add("hidden");
    this.narrBar.classList.remove("hidden");
    this.showNarrControls();
    this.updateNav();
    this.board.interactive = false;
    this.board.hintFrom = null;
    this.board.selected = null;
    if (from === 0) {
      this.curLine = [];
      this.board.lastMove = null;
      this.board.attackFrom = [];
      this.board.setPosition(this.start, false);
      this.skeletalForks();
    }
    this.status("Listen and watch the board", C.header);
    this.playSeg(from, gen);
  }

  scrubLimit() {
    const segs = this.segments();
    if (!segs.length) return 0;
    const n = this.narr || {};
    if (this.dev || n.replay || (this.mode === "learn" && this.progress.done(this.pos.fig)) || this.mode === "quiz") return segs.length - 1;
    return Math.min(segs.length - 1, Math.max(this.progress.listened(this.pos.fig), n.i || 0));
  }

  showNarrControls() {
    const n = this.narr;
    const playing = !!(n && n.playing);
    this.pauseBtn.classList.toggle("hidden", !playing);
    this.skipBtn.classList.toggle("hidden", !(playing && (this.mode === "quiz" || this.dev)));
    this.againBtn.classList.toggle("hidden", playing);
    this.narrLbl.textContent = playing ? (n.paused ? "Paused" : "🔊 Listening…") : "Done!";
    this.pauseBtn.textContent = playing && n.paused ? "▶ Play" : "❚❚ Pause";
    const lim = this.scrubLimit();
    this.scrub.classList.toggle("hidden", !(playing && lim >= 1));
    this.scrub.max = lim;
    if (!playing) this.partLbl.textContent = "";
  }

  highlight(i) {
    this.textEl.querySelectorAll(".speaking").forEach((n) => n.classList.remove("speaking"));
    const segs = this.segments();
    if (i >= 0 && i < segs.length) {
      const spans = this.textEl.querySelectorAll(`[data-seg="${i}"]`);
      spans.forEach((n) => n.classList.add("speaking"));
      if (spans.length) this.scrollIntoText(spans[0]);
      this.scrub.value = i;
      this.partLbl.textContent = `Part ${i + 1} of ${segs.length}`;
    }
  }
  scrollIntoText(node) {
    const box = this.textEl.getBoundingClientRect(), r = node.getBoundingClientRect();
    if (r.top < box.top + 8 || r.bottom > box.bottom - 8) {
      this.textEl.scrollTo({ top: this.textEl.scrollTop + (r.top - box.top) - box.height * 0.25, behavior: "smooth" });
    }
  }

  async playSeg(i, gen) {
    if (gen !== this.narrGen || !this.narr) return;
    const segs = this.segments();
    if (i >= segs.length) { this.finishNarration(); return; }
    this.narr.i = i;
    const before = this.scrubLimit();
    if (this.mode === "learn") this.progress.noteListened(this.pos.fig, i);
    if (this.scrubLimit() !== before || this.scrub.classList.contains("hidden")) this.showNarrControls();
    this.highlight(i);
    const how = await audio.speak(segs[i].say);
    if (gen !== this.narrGen || !this.narr) return;
    if (how === "cancelled" || this.narr.paused) { this.narr.resumeAt = i; return; }
    this.afterSeg(i, gen);
  }

  async afterSeg(i, gen) {
    const segs = this.segments();
    const seg = segs[i];
    const key = seg.move;
    const lines = this.pos.lines || {};
    if (key && key in lines) {
      const t0 = Date.now();
      const fork = (this.pos.forks || {})[key] || null;
      const ok = await this.gotoLine(lines[key], { fork, gen });
      if (!ok || gen !== this.narrGen) return;
      const rest = Math.max(0, PAUSE_AFTER_MOVE - (Date.now() - t0));
      this.sched(rest, () => this.playSeg(i + 1, gen), gen);
    } else {
      const nxt = i + 1 < segs.length ? segs[i + 1].a : null;
      const paraBreak = nxt != null && this.fullText.slice(seg.b, nxt).includes("\n");
      this.sched(paraBreak ? 450 : 120, () => this.playSeg(i + 1, gen), gen);
    }
  }

  sched(ms, fn, gen) {
    if (gen !== this.narrGen || !this.narr) return;
    this.narr.pending = fn;
    if (this.narr.paused) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.runPending(), Math.max(1, ms));
  }
  runPending() {
    this.timer = null;
    if (!this.narr) return;
    const fn = this.narr.pending;
    this.narr.pending = null;
    if (fn) fn();
  }

  togglePause() {
    const n = this.narr;
    if (!n || !n.playing) return;
    if (!n.paused) {
      n.paused = true;
      clearTimeout(this.timer);
      this.timer = null;
      audio.stopSpeaking();
    } else {
      n.paused = false;
      if (n.resumeAt != null) {
        const i = n.resumeAt;
        n.resumeAt = null;
        n.pending = null;
        this.playSeg(i, this.narrGen);
      } else if (n.pending) this.runPending();
    }
    this.showNarrControls();
  }

  finishNarration() {
    const n = this.narr;
    if (!n) return;
    n.playing = false;
    this.textEl.querySelectorAll(".speaking").forEach((x) => x.classList.remove("speaking"));
    if (!this.pos.playable || this.solvedNow) this.completePage();
    this.updateNav();
    this.showNarrControls();
    if (!this.pos.playable) {
      this.say(this.mode === "learn" ? "All done! Press Next when you're ready, or Hear it again." : "All done!");
      this.status("Tap a blue move to see it again");
      if (this.mode === "learn" && this.canOpen(this.idx + 1)) this.nextBtn.classList.add("bounce");
    }
    const cb = n.onEnd;
    n.onEnd = null;
    if (cb) cb();
  }

  stopNarration(hide = false) {
    this.narrGen++;
    clearTimeout(this.timer);
    this.timer = null;
    audio.stopSpeaking();
    const was = this.narr;
    this.narr = null;
    this.textEl.querySelectorAll(".speaking").forEach((x) => x.classList.remove("speaking"));
    this.nextBtn.classList.remove("bounce");
    if (hide) this.narrBar.classList.add("hidden");
    if (was) this.updateNav();
  }

  skipNarration() {
    const n = this.narr;
    if (!n || !n.playing || !(this.mode === "quiz" || this.dev)) return;
    const cb = n.onEnd;
    const replay = n.replay;
    this.stopNarration();
    this.narr = { playing: false, replay, onEnd: null };
    if (!this.pos.playable || this.solvedNow) this.completePage();
    this.narrBar.classList.remove("hidden");
    this.showNarrControls();
    this.updateNav();
    if (cb) cb();
  }

  seek(k) {
    const segs = this.segments();
    if (!segs.length) return;
    k = Math.max(0, Math.min(k, this.scrubLimit()));
    const replay = this.narr ? this.narr.replay : true;
    const onEnd = this.narr ? this.narr.onEnd : null;
    this.stopNarration();
    let line = [];
    for (const s of segs.slice(0, k)) if (s.move && this.pos.lines && s.move in this.pos.lines) line = this.pos.lines[s.move];
    const [bs, ms] = this.boards(line);
    this.curLine = line.slice();
    this.lineToken = (this.lineToken || 0) + 1;
    this.board.attackFrom = [];
    this.board.lastMove = ms.length ? ms[ms.length - 1] : null;
    this.board.setPosition(bs[bs.length - 1], false);
    if (!line.length) this.skeletalForks();
    const gen = ++this.narrGen;
    this.narr = { i: k, replay, onEnd, playing: true, paused: false, pending: null, resumeAt: null };
    this.narrBar.classList.remove("hidden");
    this.showNarrControls();
    this.updateNav();
    this.playSeg(k, gen);
  }

  textClicked(e) {
    const span = e.target.closest("[data-seg]");
    const link = e.target.closest("[data-move]");
    if (this.narr && this.narr.playing) {
      if (span) {
        const i = +span.dataset.seg;
        if (i <= this.scrubLimit()) this.seek(i);
      }
      return;
    }
    if (link) this.moveClicked(link.dataset.move, link);
  }

  // ------------------------------------------------------------ tappable moves
  moveClicked(key, link) {
    const line = (this.pos.lines || {})[key];
    if (!line) return;
    this.textEl.querySelectorAll(".current").forEach((n) => n.classList.remove("current"));
    if (link) link.classList.add("current");
    this.showing = line.slice();
    this.showingFork = (this.pos.forks || {})[key] || null;
    this.showUpto(line.length, this.showingFork);
  }
  showUpto(upto, fork = null) {
    const line = this.showing.slice(0, upto);
    this.lineBar.classList.remove("hidden");
    this.showingUpto = upto;
    this.lineLbl.textContent = "Showing: " + (this.lineText(line) || "the starting position");
    this.status("Watching the moves", C.header);
    this.gotoLine(line, { fork });
  }
  lineStep(d) {
    if (!this.showing) return;
    const k = this.showingUpto + d;
    if (k < 0 || k > this.showing.length) return;
    this.showUpto(k, k === this.showing.length ? this.showingFork : null);
  }
  lineText(tokens) {
    let b = this.start;
    const out = [];
    let num = 1;
    for (const t of tokens) {
      if (t.startsWith("~")) {
        b = applyToken(b, t).pos;
        out.push(t.slice(1, 3) + "-" + t.slice(3, 5));
        continue;
      }
      let san = t;
      try {
        const c = new Chess();
        c.load(toFen(b), { skipValidation: true });
        san = c.move({ from: t.slice(0, 2), to: t.slice(2, 4), promotion: t[4] || "q" }).san;
      } catch (_) { /* keep the plain squares */ }
      if (b.turn === "w") out.push(`${num}. ${san}`);
      else { out.push(!out.length || out[out.length - 1].includes("-") ? `${num}...${san}` : san); num++; }
      b = applyToken(b, t).pos;
    }
    return out.join(" ");
  }

  // ------------------------------------------------------------ the kid's moves
  legalTargets(sq) {
    const pos = this.board.pos;
    if (!pos) return null;
    if (this._legalFor !== pos) {
      this._legalFor = pos;
      this._legal = null;
      try {
        const c = new Chess();
        c.load(toFen(pos), { skipValidation: true });
        this._legal = c.moves({ verbose: true });
      } catch (_) { this._legal = null; }
    }
    if (!this._legal) return null;
    const name = sqName(sq);
    return this._legal.filter((m) => m.from === name).map((m) => parseSq(m.to));
  }

  openLines() {
    const played = this.active.slice(0, this.ply);
    const lines = [this.pos.solution || []].concat(this.pos.alts || []);
    return lines.filter((l) => l.length > this.ply && played.every((m, i) => l[i] === m));
  }
  expected() {
    const o = this.openLines();
    if (!o.length) return null;
    const t = o[0][this.ply];
    return { from: parseSq(t.slice(0, 2)), to: parseSq(t.slice(2, 4)) };
  }

  async userMove(from, to, animate) {
    const bv = this.board;
    if (!this.pos.playable || this.solvedNow || bv.busy) return;
    bv.clearCallout();
    const base = sqName(from) + sqName(to);
    const open = this.openLines();
    const tok = open.map((l) => l[this.ply]).find((t) => t.slice(0, 4) === base);
    const promo = tok ? tok[4] : "q";
    const before = bv.pos;
    const after = playMove(before, from, to, promo);
    const move = { from, to };
    bv.interactive = false;
    bv.selected = null;
    if (animate) await bv.animateStep(before, after, move, { ms: 230 });
    else { bv.pos = after; bv.lastMove = move; bv.render(); audio.play("move"); }
    if (tok) {
      this.active = open.find((l) => l[this.ply] === tok);
      this.ply++;
      bv.flash(to, C.good);
      const sol = this.active;
      if (bv.pos.board[to] && bv.pos.board[to][1] === "N") {
        const n = bv.showAttacks(to);
        if (n >= 2) this.status(`Fork! That knight attacks ${n} things at once!`, C.good);
      }
      if (this.ply >= sol.length) {
        await wait(this.ply > 1 ? 500 : 900);
        this.success();
        return;
      }
      this.say(pick(["Good move! Now watch the reply...", "Nice! Here comes the answer...", "Yes! Let's see what they do..."]));
      const gen = this.loadGen;
      await wait(1100);
      if (gen !== this.loadGen) return;
      bv.clearAttacks();
      const reply = sol[this.ply];
      this.ply++;
      const { pos: p2, move: m2 } = applyToken(bv.pos, reply);
      await bv.animateStep(bv.pos, p2, m2, { ms: 300 });
      if (gen !== this.loadGen) return;
      if (this.ply >= sol.length) { this.success(); return; }
      bv.interactive = true;
      this.status(`${this.sideName} to move. Keep going!`);
      this.yourMove(true);
      this.say("Your turn again. What's the follow-up?");
    } else {
      if (this.firstSolve && !this.pz.explained) {
        this.pz.wrong = (this.pz.wrong || 0) + 1;
        if (this.mode === "learn") this.progress.save();
      }
      audio.play("bad");
      bv.flash(to, C.bad, 700);
      this.status("Not quite. Try again!", C.bad);
      this.say(pick(["Hmm, not that one. Look again!", "Close! Try another move.", "Oops! The pieces are back. Have another go!"]));
      const gen = this.loadGen;
      await wait(800);
      if (gen !== this.loadGen) return;
      const hf = bv.hintFrom, ht = bv.hintTo;
      this.reset();
      bv.hintFrom = hf; bv.hintTo = ht;
      bv.render();
      if (this.mode === "quiz") { this.streak = 0; this.updateScore(); }
    }
  }

  async success() {
    this.solvedNow = true;
    const bv = this.board;
    bv.clearAttacks();
    bv.interactive = false;
    const pts = this.firstSolve ? puzzlePoints(this.pz, this.answerShown) : 0;
    const fig = this.pos.fig;
    const gen = this.loadGen;
    if (this.mode === "learn") {
      if (this.firstSolve) this.progress.award(fig, pts);
      this.progress.mark(fig);
      if (!this.segments().length) this.completePage();
      this.updateCounter();
    }
    this.status("Solved!", C.good);
    this.say(this.firstSolve
      ? `You earned ${pts} point${pts === 1 ? "" : "s"}! Now listen to what Professor Farnsworth says about it.`
      : "Solved again! Now listen to what Professor Farnsworth says about it.");
    if (!this.revealed) this.fillText(true);
    this.updateNav();
    if (pts >= 5) { audio.play("battle"); await bv.knightCharge(); await wait(600); }
    else if (pts === 4) { audio.play("star"); bv.starBurst(); await wait(1500); }
    else {
      audio.play(pts ? "star" : "good");
      bv.confetti();
      bv.banner(pts ? pick(["★ You got it! ★", "★ Super! ★", "★ Nice work! ★"]) : "★ Solved again! ★", C.good);
      await wait(1500);
    }
    if (gen !== this.loadGen) return;
    if (this.mode === "quiz") {
      this.score += pts;
      this.streak++;
      this.updateScore();
    } else {
      await this.floatPoints(pts);
      if (gen !== this.loadGen) return;
    }
    if (this.solvedNow && !(this.narr && this.narr.playing)) this.startNarration({ onEnd: () => this.afterSolvedNarration() });
  }

  afterSolvedNarration() {
    this.status("Solved! Tap the blue moves to see them again.", C.good);
    this.say(this.mode === "learn" ? "Great work! Press Next for the next one." : "Great work! Press Next puzzle for another one.");
    if (this.mode === "learn" && this.canOpen(this.idx + 1)) this.nextBtn.classList.add("bounce");
  }

  // "+5" flies from the board up to the points in the header, then the points count up.
  async floatPoints(pts) {
    if (pts <= 0) return;
    const from = this.boardWrap.getBoundingClientRect(), to = this.badgeBox.getBoundingClientRect();
    const el = h("div.float-pts", `+${pts}`);
    document.body.append(el);
    const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2;
    const x1 = to.left + to.width * 0.6, y1 = to.top + to.height * 0.6;
    await el.animate([
      { transform: `translate(${x0}px, ${y0}px) translate(-50%,-50%) scale(1.3)` },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 60}px) translate(-50%,-50%) scale(1.1)`, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) translate(-50%,-50%) scale(.6)` },
    ], { duration: 750, easing: "ease-in-out", fill: "forwards" }).finished.catch(() => {});
    el.remove();
    audio.play("coin");
    const total = this.progress.points, start = total - pts;
    const rankBefore = rankIndex(start);
    for (let i = 1; i <= pts; i++) {
      this.drawBadge(start + i, true);
      await wait(70);
    }
    await wait(300);
    this.drawBadge(total);
    const rankAfter = rankIndex(total);
    if (rankAfter > rankBefore) {
      audio.play("rankup");
      await this.rankUp(RANKS[rankAfter]);
    }
  }

  async rankUp(rank) {
    this.say(`WOW! You are now a ${rank.name}!`);
    const card = h("div.rankup", h("div.rankup-in", h("div.rankup-title", "RANK UP!"), badge(rank, 120), h("div.rankup-name", rank.name)));
    this.boardWrap.append(card);
    this.board.starBurst(16, true);
    await wait(2800);
    card.remove();
  }

  // ------------------------------------------------------------ navigation and helpers
  goHome() { this.app.show("home"); }

  next() {
    if (this.mode === "learn") {
      if (this.idx + 1 >= this.flat.length) return;
      if (!this.canOpen(this.idx + 1)) {
        this.say(this.pos.playable ? "Finish this page first: solve the puzzle and hear Professor Farnsworth's explanation!"
          : "Finish this page first: listen to the end!");
        this.nextBtn.classList.remove("shake");
        void this.nextBtn.offsetWidth;
        this.nextBtn.classList.add("shake");
        return;
      }
      this.load(this.idx + 1);
    } else {
      if (!this.order.length) return;
      this.qpos++;
      if (this.qpos >= this.order.length) this.qpos = 0;
      this.load(this.order[this.qpos]);
    }
  }
  prev() { if (this.mode === "learn" && this.idx > 0) this.load(this.idx - 1); }

  flip() {
    this.board.flipped = !this.board.flipped;
    this.board.render();
  }

  hint() {
    if (this.solvedNow || !this.pos.playable || (this.narr && this.narr.playing)) return;
    const exp = this.expected();
    if (this.mode === "learn") {
      if (this.hints >= 2 || !exp) { this.say("That's all the hints! You can do it."); return; }
      if (this.firstSolve && this.hints === 0 && !this.hintWarned) {
        this.hintWarned = true;
        this.say("Each hint costs one point. Press Hint again if you want one.");
        return;
      }
    }
    this.hints++;
    if (this.firstSolve && !this.pz.explained) {
      this.pz.hints = (this.pz.hints || 0) + 1;
      if (this.mode === "learn") this.progress.save();
    }
    const bv = this.board;
    if (this.mode === "learn") {
      bv.hintFrom = exp.from;
      if (this.hints === 1) this.say("Hint: the orange circle shows which piece to move!");
      else { bv.hintTo = exp.to; this.say("Big hint: move the circled piece to the square with the dotted ring!"); }
      bv.render();
    } else if (this.hints === 1) {
      this.say(`Hint: this puzzle comes from the lesson “${this.pos.topicTitle}”.`);
    } else if (exp) {
      bv.hintFrom = exp.from;
      bv.render();
      this.say("Big hint: the orange circle shows which piece to move!");
    }
    if (this.pos.playable && !this.solvedNow) this.status(`${this.sideName} to move${this.worthText()}`);
  }

  showAnswer() {
    if (!this.pos.playable || this.solvedNow) return;
    this.answerShown = true;
    this.solvedNow = true;
    this.streak = 0;
    this.updateScore();
    this.fillText(true);
    if (this.quizNarrationOn() && this.segments().length) {
      this.say("Here's the answer. Listen and watch the board!");
      this.startNarration({ onEnd: () => this.afterSolvedNarration() });
      return;
    }
    this.say("Here's the answer. Watch the board, then read the explanation!");
    const sol = this.pos.solution.slice();
    this.showing = sol;
    const gen = this.loadGen;
    const step = (k) => {
      if (gen === this.loadGen && this.showing === sol && k <= sol.length) {
        this.showUpto(k);
        setTimeout(() => step(k + 1), 1400);
      }
    };
    step(1);
  }

  toggleQuizNarration() {
    this.progress.d.quiz_narration = !this.quizNarrationOn();
    this.progress.save();
    this.updateQuizNarrBtn();
    if (!this.quizNarrationOn() && this.narr && this.narr.playing) this.skipNarration();
  }
  updateQuizNarrBtn() {
    if (this.narrToggle) this.narrToggle.textContent = this.quizNarrationOn() ? "🔊 Narration on" : "🔇 Narration off";
  }
}
