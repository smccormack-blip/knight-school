// Knight School offline helper (made by tools/build_sw.py - don't edit by hand).
// Keeps a copy of the whole app and all the lessons on the device, so it works
// without the internet after the first visit.
const VERSION = "451f91bc296f";
const CACHE = "knight-school-" + VERSION;
const FILES = [
 "css/app.css",
 "data/index.json",
 "data/s_2_1.json",
 "data/s_2_2.json",
 "data/s_2_3.json",
 "data/s_2_4.json",
 "data/s_2_5.json",
 "data/s_3_1.json",
 "data/s_3_2.json",
 "data/s_3_3.json",
 "data/s_3_4.json",
 "data/s_4_1.json",
 "data/s_4_2.json",
 "data/s_4_3.json",
 "data/s_4_4.json",
 "data/s_4_5.json",
 "data/s_5_1.json",
 "data/s_5_2.json",
 "data/s_5_3.json",
 "data/s_5_4.json",
 "data/s_6_1.json",
 "data/s_6_2.json",
 "img/icon-180.png",
 "img/icon-192.png",
 "img/icon-512.png",
 "img/pieces/bB.png",
 "img/pieces/bK.png",
 "img/pieces/bN.png",
 "img/pieces/bP.png",
 "img/pieces/bQ.png",
 "img/pieces/bR.png",
 "img/pieces/wB.png",
 "img/pieces/wK.png",
 "img/pieces/wN.png",
 "img/pieces/wP.png",
 "img/pieces/wQ.png",
 "img/pieces/wR.png",
 "index.html",
 "js/app.js",
 "js/audio.js",
 "js/board.js",
 "js/chess.js",
 "js/course.js",
 "js/lesson.js",
 "js/model.js",
 "js/progress_code.js",
 "js/store.js",
 "js/ui.js",
 "manifest.webmanifest",
 "snd/again.wav",
 "snd/bad.wav",
 "snd/battle.wav",
 "snd/coin.wav",
 "snd/good.wav",
 "snd/move.wav",
 "snd/rankup.wav",
 "snd/rewind.wav",
 "snd/star.wav",
 "snd/tick.wav",
 "snd/yourmove.wav"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", ...FILES].map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("knight-school-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) c.put(req, res.clone());
    return res;
  }))));
});
