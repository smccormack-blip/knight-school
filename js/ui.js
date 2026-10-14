// Small helpers for building the screens.
import { TIER_COLORS } from "./store.js";

// h("div.card", {onclick}, child, "text", ...)
export function h(spec, attrs, ...kids) {
  const [tag, ...classes] = spec.split(".");
  const el = document.createElement(tag || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

export const pieceImg = (p, cls = "") => h("img" + (cls ? "." + cls : ""), { src: `img/pieces/${p}.png`, alt: "", draggable: "false" });

// A round rank badge: the rank's piece in a plain, bronze, silver or gold ring.
export function badge(rank, size = 48) {
  const col = TIER_COLORS[rank.tier];
  const n = { Bronze: 1, Silver: 2, Gold: 3 }[rank.tier] || 0;
  return h("div.badge", { style: { width: size + "px", height: size + "px", background: col, "--bs": size + "px" }, title: rank.name },
    h("div.badge-in", pieceImg("w" + rank.piece)),
    n ? h("div.badge-stars", "★".repeat(n)) : null);
}

// A dialog box over the screen. Returns {el, close}.
export function modal(content, { onClose, wide = false } = {}) {
  const box = h("div.modal" + (wide ? ".wide" : ""), content);
  const back = h("div.modal-back", box);
  const close = () => {
    back.remove();
    document.removeEventListener("keydown", esc);
    if (onClose) onClose();
  };
  const esc = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", esc);
  back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return { el: box, close };
}

export function ask(title, text, yes = "Yes", no = "No") {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal([
      h("h2", title), h("p", text),
      h("div.row.center",
        h("button.btn.good", { onclick: () => { answered = true; m.close(); resolve(true); } }, yes),
        h("button.btn.grey", { onclick: () => { m.close(); } }, no)),
    ], { onClose: () => { if (!answered) resolve(false); } });
  });
}

export function askPassword(title) {
  return new Promise((resolve) => {
    let val = null;
    const inp = h("input.big", { type: "password", inputmode: "numeric", autocomplete: "off", placeholder: "Password" });
    const go = () => { val = inp.value.trim(); m.close(); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    const m = modal([h("h2", title), inp, h("div.row.center", h("button.btn.good", { onclick: go }, "OK"),
      h("button.btn.grey", { onclick: () => m.close() }, "Cancel"))], { onClose: () => resolve(val) });
    setTimeout(() => inp.focus(), 50);
  });
}

export function toast(text, ms = 2200) {
  const t = h("div.toast", text);
  document.body.append(t);
  setTimeout(() => t.classList.add("out"), ms);
  setTimeout(() => t.remove(), ms + 500);
}
