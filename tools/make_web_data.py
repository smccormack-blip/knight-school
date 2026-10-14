"""Turn the Windows build's lesson files (section_X_Y.json) into the web app's data files.

    python tools/make_web_data.py <folder with section_*.json> [more folders...]

Writes data/index.json (the list of sections) and data/s_X_Y.json (one per section),
keeping only what the web app uses. The first folder that has a section wins.
"""
import glob, json, os, re, sys

KEEP = ("fig", "side", "fen", "flipped", "marks", "solution", "alts", "paragraphs", "lines",
        "segments", "display_only", "read_only")
CHAPTERS = {"2": "The Double Attack", "3": "The Discovered Attack", "4": "The Pin and the Skewer",
            "5": "Removing the Guard", "6": "Mating Patterns"}


def main(folders):
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, "data")
    os.makedirs(out, exist_ok=True)
    found = {}
    for folder in folders:
        for p in glob.glob(os.path.join(folder, "section_*.json")):
            m = re.search(r"section_(\d+)_(\d+)\.json$", p)
            k = (int(m.group(1)), int(m.group(2)))
            found.setdefault(k, p)
    index = []
    for k in sorted(found):
        sec = json.load(open(found[k], encoding="utf-8"))
        topics = []
        for t in sec["topics"]:
            ps = []
            for p in t["positions"]:
                q = {key: p[key] for key in KEEP if p.get(key) not in (None, [], {}, False, "")}
                forks = {mk: v["fork"] for mk, v in (p.get("link_meta") or {}).items() if v.get("fork")}
                if forks:
                    q["forks"] = forks
                for s in q.get("segments", []):
                    s.pop("audio", None)
                ps.append(q)
            topics.append({"title": t["title"].rstrip("."), "positions": ps})
        name = "s_%d_%d.json" % k
        with open(os.path.join(out, name), "w", encoding="utf-8") as f:
            json.dump({"section": sec["section"], "title": sec["title"], "topics": topics},
                      f, ensure_ascii=False, separators=(",", ":"))
        allp = [p for t in topics for p in t["positions"]]
        index.append({"section": sec["section"], "title": sec["title"], "file": name,
                      "chapter": sec.get("chapter") or CHAPTERS.get(sec["section"].split(".")[0], ""),
                      "pages": len(allp),
                      # every page's figure number, and which pages are puzzles (1) or not (0),
                      # so the app knows the whole course without loading every section
                      "figs": [p["fig"] for p in allp],
                      "play": "".join("1" if p.get("fen") and p.get("solution") and not p.get("display_only")
                                      else "0" for p in allp),
                      "topics": [[t["title"], len(t["positions"])] for t in topics]})
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"sections": index, "author": "Ward Farnsworth",
                   "work": "Predator at the Chessboard: A Field Guide to Chess Tactics",
                   "source": "https://www.chesstactics.org", "license": "CC BY-NC-ND 2.5",
                   "license_url": "http://creativecommons.org/licenses/by-nc-nd/2.5/"}, f, indent=1)
    print("wrote", len(index), "sections,", sum(s["pages"] for s in index), "pages")


if __name__ == "__main__":
    main(sys.argv[1:])
