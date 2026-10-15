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

The narration uses the same recorded voice as the Windows program, once the recordings are
uploaded (below). Each lesson's narration, and the next lesson's, is saved on the device when the
lesson is opened, so it plays offline; "🔊 saved" on the lesson list shows which ones are saved.
Any sentence without a recording (or before the upload) uses the device's own voice; the ⚙ button
can also switch to the device's voice.

### Uploading the recordings (one time, from the Windows computer)

1. In the KnightSchool folder, run `build.bat` (if you haven't since the narration fix), then
   double-click `make_web_audio.bat`. It makes a `knight-school-audio` folder on the desktop
   with an `audio` folder inside (about 350 MB; the first run takes a while).
2. Install GitHub Desktop (https://desktop.github.com), sign in, and choose
   File › Clone repository › `smccormack-blip/knight-school`.
3. Copy the `audio` folder into the cloned `knight-school` folder (next to `index.html`).
4. In GitHub Desktop: type a summary such as "Add narration", click **Commit to main**, then
   **Push origin**. The upload takes a while; the site updates a few minutes after it finishes.

Run `make_web_audio.bat` and repeat steps 3–4 whenever new lessons are added.

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
