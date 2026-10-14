// Progress codes: move one player's progress between devices (web app <-> Windows app).
// Same rules as progress_code.py in the Windows program; see that file for the layout.
//   NAME-XXXX-XXXX-XXXX : 60 bits in Crockford base 32 =
//   version 2 | avatar 4 | reached figure 16 | points 14 | HMAC-SHA256 check 24

export const AVATARS = ["wN", "wQ", "wK", "wB", "wR", "wP", "bN", "bQ", "bK", "bB", "bR", "bP"];
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY = "KnightSchool progress code v1 - Farnsworth forks, pins and mates";
const VERSION = 1n;
const MAX_POINTS = (1 << 14) - 1;

export class CodeError extends Error {}

const squash = (name) => name.trim().split(/\s+/).join(" ");
const normName = (name) => squash(name).toLowerCase();

function figBits(fig) {
  const p = String(fig).split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x))) throw new CodeError("bad figure " + fig);
  const [a, b, c, d] = p;
  if (!(a >= 2 && a <= 9 && b >= 0 && b < 8 && c >= 0 && c < 32 && d >= 0 && d < 32)) throw new CodeError("figure out of range " + fig);
  return ((a - 2) << 13) | (b << 10) | (c << 5) | d;
}

const bitsFig = (v) => `${(v >> 13) + 2}.${(v >> 10) & 7}.${(v >> 5) & 31}.${v & 31}`;

let keyPromise = null;
function hmacKey() {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey("raw", new TextEncoder().encode(KEY),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  return keyPromise;
}

async function check(name, payload) {
  const nb = new TextEncoder().encode(normName(name));
  const msg = new Uint8Array(nb.length + 1 + 5);
  msg.set(nb, 0);
  msg[nb.length] = 0x7c; // "|"
  for (let i = 0; i < 5; i++) msg[nb.length + 1 + i] = Number((payload >> BigInt(8 * (4 - i))) & 0xffn);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), msg));
  return BigInt((sig[0] << 16) | (sig[1] << 8) | sig[2]);
}

export async function makeCode(name, avatar, reachedFig, points) {
  name = squash(name);
  if (!name) throw new CodeError("no name");
  const av = BigInt(Math.max(0, AVATARS.indexOf(avatar)));
  const pts = BigInt(Math.max(0, Math.min(Math.floor(points), MAX_POINTS)));
  const payload = (VERSION << 34n) | (av << 30n) | (BigInt(figBits(reachedFig)) << 14n) | pts;
  const v = (payload << 24n) | (await check(name, payload));
  let chars = "";
  for (let i = 11; i >= 0; i--) chars += ALPHABET[Number((v >> BigInt(5 * i)) & 31n)];
  return `${name.replace(/ /g, "_")}-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

export async function readCode(text) {
  text = (text || "").trim();
  const m = /^(.*?)[\s-]+((?:[0-9A-Za-z][\s-]*){12})$/.exec(text);
  if (!m) throw new CodeError("That doesn't look like a progress code.");
  const name = m[1].trim().replace(/_/g, " ");
  const raw = m[2].replace(/[\s-]/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  if (!name || [...raw].some((ch) => !ALPHABET.includes(ch))) throw new CodeError("That doesn't look like a progress code.");
  let v = 0n;
  for (const ch of raw) v = (v << 5n) | BigInt(ALPHABET.indexOf(ch));
  const payload = v >> 24n, chk = v & 0xffffffn;
  if ((payload >> 34n) !== VERSION || (await check(name, payload)) !== chk) {
    throw new CodeError("That code doesn't look right. Check each letter and try again.");
  }
  const av = Number((payload >> 30n) & 15n);
  return { name, avatar: AVATARS[av] || AVATARS[0], reached: bitsFig(Number((payload >> 14n) & 0xffffn)),
           points: Number(payload & BigInt(MAX_POINTS)) };
}

// Must match TEST_VECTORS in progress_code.py.
export const TEST_VECTORS = [
  [["Chip", "wB", "4.5.12.2", 560], "Chip-9NB0-G8R9-J4KS"],
  [["Mary Ann", "bQ", "2.1.1.1", 0], "Mary_Ann-BG88-8000-P61J"],
  [["Zoë", "wN", "6.2.15.5", 4321], "Zoë-88KS-A3GR-X89H"],
];
