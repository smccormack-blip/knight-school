# Knight School (web version)

Chess tactics for kids, from Ward Farnsworth's *Predator at the Chessboard*
([chesstactics.org](https://www.chesstactics.org)), used under
[CC BY-NC-ND 2.5](http://creativecommons.org/licenses/by-nc-nd/2.5/). Free, non-commercial use only.

This is the phone and tablet version of the Windows program. It runs in the browser and can
be added to the home screen, where it works like an app, offline too.

**Play it:** https://smccormack-blip.github.io/knight-school/

## Putting it on a phone or tablet

* **iPhone / iPad (Safari):** open the link, tap the Share button, then **Add to Home Screen**.
* **Android (Chrome):** open the link, tap the ⋮ menu, then **Add to Home screen** (or **Install app**).

After the first visit everything (all lessons, pictures and sounds, about 5 MB) is kept on the
device, so it works without the internet.

## Progress

Progress is saved on the device, in the browser. To move a player to another device (or from
the Windows program, or as a backup), use **Progress codes** on the "Who's playing?" screen.
On iPhones, add it to the Home Screen: Safari can clear data of web pages that haven't been
opened for a few weeks, but not of Home Screen apps.

## The voice

The narration uses the device's own text-to-speech voice. Pick a voice and speed with the ⚙
button. On iPhone/iPad, an "Enhanced" English voice (Settings › Accessibility › Spoken
Content › Voices) sounds much better.

## For grown-ups

* Remove a player: "Remove a player (grown-ups)" on the "Who's playing?" screen, password 1111.
* Dev mode (narration can be skipped, Next always works): the lock on the home screen, password 1111.

## Updating (for Claude)

* `tools/make_web_data.py <folders with section_*.json>` rebuilds `data/` from the Windows build's lesson files.
* `tools/build_sw.py` must be run after any change, so devices pick up the new version
  (it lists every file for offline use and gives the version a new number).
* Devices get the new version the second time the app is opened after an update.

## Credits

* Lessons: Ward Farnsworth, CC BY-NC-ND 2.5.
* Chess pieces: "Chessnut" by Alexis Luengas, Apache License 2.0 (`img/pieces/LICENSE-chessnut.txt`).
* Move checking: [chess.js](https://github.com/jhlywa/chess.js), BSD 2-Clause (`js/LICENSE-chess.js.txt`).
