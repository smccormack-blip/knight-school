"""Write sw.js (the offline helper) listing every file the app needs, with a version
made from the files' contents, so phones pick up changes after each push.

    python tools/build_sw.py
"""
import hashlib, json, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ["css", "js", "img", "snd", "data"]
TOP = ["index.html", "manifest.webmanifest"]

files = list(TOP)
for d in DIRS:
    for base, _, names in os.walk(os.path.join(HERE, d)):
        for n in sorted(names):
            if n.endswith((".txt", ".py")):
                continue
            files.append(os.path.relpath(os.path.join(base, n), HERE).replace(os.sep, "/"))
files.sort()
h = hashlib.sha256()
for f in files:
    h.update(f.encode())
    with open(os.path.join(HERE, f), "rb") as fh:
        h.update(fh.read())
version = h.hexdigest()[:12]

SW = """// Knight School offline helper (made by tools/build_sw.py - don't edit by hand).
// Keeps a copy of the whole app and all the lessons on the device, so it works
// without the internet after the first visit.
const VERSION = "%s";
const CACHE = "knight-school-" + VERSION;
const FILES = %s;

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
""" % (version, json.dumps(files, indent=1))
with open(os.path.join(HERE, "sw.js"), "w", encoding="utf-8") as f:
    f.write(SW)
print("sw.js: %d files, version %s" % (len(files), version))
