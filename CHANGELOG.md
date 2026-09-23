# Version history

Newest first. Each version is what was uploaded for signing, so the numbers are the ones Firefox
shows in `about:addons`.

---

## 1.1.0 — 23 September 2026

**The hints wait for whatever a click opens.** Pressing a hint that opens a menu, a dialog or a
cookie wall used to work the hints out while the click was still happening, which is before the
new thing exists — so the thing you had just opened was the one part of the page with no hint on
it, and you had to leave `!short` and come back. The hints are now worked out again once the page
stops changing, and at the latest a moment later, so a menu that fades in is hinted when it has
arrived rather than while it is still on its way.

**<kbd>Space</kbd> works the hints out again**, for a page that has put something up on its own
rather than because you clicked. No hint is spelled with a space, so nothing was given up for it.

**The hints are see-through.** The colour gives way and the letter stays as dark as it was,
because the letter is the one thing on a hint that has to be read. The hints you can no longer
press, once you have typed the first letter of one, sit furthest back of all.

**Clicking a field no longer switches UOKey off.** A field has to have the cursor for you to type
in it, so the bar steps out of the way — but it was saying it had been switched off when it did,
which put the bar away in every other tab and kept it away on every page opened afterwards. A
page can hide a field behind anything, so this happened far more often than it sounds: on
learngitbranching.js.org the home icon is a `<label>` for the terminal, and pressing its hint
switched UOKey off across the browser. Stepping aside is now just stepping aside.

**The bar comes back when you are done typing.** <kbd>Enter</kbd> in the field it stepped aside
for brings it back with the keyboard, and so does <kbd>Ctrl</kbd>+<kbd>Space</kbd>. In a text box
that takes more than one line, Enter breaks a line and the bar stays out of the way; it counts as
done only when the line was sent rather than broken.

**A field is found by what you have typed into it.** Fields were only ever indexed by their
placeholder, label or tooltip — and a search box you have already used is showing your words, not
its placeholder, so the one thing on screen was the one thing that could not be searched for.
Passwords are left out: what the screen stars out, UOKey does not read.

---

## 1.0.0 — 21 September 2026

The first version.

Press <kbd>Ctrl</kbd>+<kbd>Space</kbd>, type part of what a link, button or field says, and press
<kbd>Enter</kbd> to click it. Searches visible text as well as placeholders, labels, tooltips and
image descriptions, ignoring capitals, accents and which keyboard you type on. Anything the page
gives the hand cursor counts as clickable.

With `!short` for a hint key on everything at once, `!marks` for bookmarks, `!tabs` for open tabs
and `!help` for every key it uses. Runs in the page's frames as well, so a chat box, cookie wall
or payment field is part of the page. The bar is a switch for the whole browser, and stays on
through links and reloads until it is turned off.
