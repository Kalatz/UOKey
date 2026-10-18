# Version history

Newest first. Each version is what was uploaded for signing, so the numbers are the ones Firefox
shows in `about:addons`.

---

## 1.6.1 - 18 October 2026

**1.6.0 under a new number, for the addons.mozilla.org listing.**\
1.6.0 was signed for self-distribution, and addons.mozilla.org never takes the same number twice.

---

## 1.6.0 - 18 October 2026

**Built on 1.4.2.**\
1.5.1 was a separate test build: its `!copy` and `!video` are not in this version, and `;up` does
what its `!up` did.

### Added

- **`;` starts a command, in place of `!`.**\
  It is under the little finger on the home row. `!short` is `;shortcut`, still `;s`.
- **`;d0` to `;dz` unload a tab to free its memory.**\
  `;d0` is the tab you are on; `1` to `9`, then `a` to `z`, count along the tab strip. The icon
  fades to grey first. This is the Tab Unloader add-on folded in, with no new permission.
- **`;` lists this window's tabs with their keys.**\
  Click one to go there, or after `;d`, to unload it.
- **`;reload`, or `;r`, works the hint keys and the tabs' keys out again.**
- **`;up`, or `;u`, goes to the top of the page.**\
  Or of the panel in the middle of the screen, on a site that scrolls one of those instead.
- **`;;` lists the settings and which way each is set.**\
  `;;hints` turns off what comes up while a command is typed, `;;fast` is the old `!fast`, and
  `;;settings` opens Preferences.

### Removed

- **`!` commands.**\
  Type `;` instead; `!` is ordinary text to find again.
- **`!fast` from the list of commands.**\
  It is the setting `;;fast` now.

### Fixed

- **A setting changed in one tab reaches every tab.**\
  A tab that loaded while UOKey was still starting never heard of the change.
- **The F for fast mode sits inside the box, at its right-hand end.**\
  It used to float beside the bar.
- **The panel's scrollbar is dark, to match the panel.**

---

## 1.4.2 - 10 October 2026

1.4.1 under a new number, and the one put up on addons.mozilla.org for anyone to find and
install. 1.4.1 went up to be signed for self-distribution rather than listed, and
addons.mozilla.org never takes the same number twice.

**The icon reads as a picture to addons.mozilla.org.** Its checker only looks at the start of an
SVG file, and the icon began with a hidden copy of the drawing it was exported from, so the
checker called it corrupt. That copy is gone, and the drawing sits in a square, as an icon
should; Firefox showed it the same way before and still does.

**Firefox 142 or newer.** The line saying UOKey collects no data is only read from Firefox 140 on,
and from 142 on Android, so older versions were told nothing. Firefox 140 ESR, the last release
before 142 still being looked after, stopped getting updates on 29 September 2026.

---

## 1.4.1 - 10 October 2026

Signed, but never listed: 1.4.2 is the same add-on, put up on addons.mozilla.org.

**`!github` opens UOKey's page on GitHub**, in a new tab beside the one you are on, where a
star helps other people find it. It has no letter, and comes last in the list of commands. The
end of `!help` says so in orange, and Preferences has a **Star UOKey on GitHub** button that
opens the same page. Nothing opens on install or update, and the bar says nothing about it
anywhere else.

**Preferences says what each permission is for.** Below the switch for running on the pages you
visit, it now goes through the others Firefox asks for, bookmarks for `!marks` and tabs for
`!tabs` and the site icons, and what UOKey keeps in storage. `about:addons` links to the GitHub
page as UOKey's homepage.

Everything else is 1.4.0 as it was.

---

## 1.4.0 - 9 October 2026

**Every command has a letter.** `!h`, `!b`, `!s`, `!m` and `!t`, shown beside the names in the `!`
list, in `!help` and in the README. `!s` and <kbd>Enter</kbd> is `!short`. Enter already finished
any name typed far enough to be the only one it could be, so the letters worked before; they are
written down now, and a command's own letter comes before any other name that starts with it.

**`!fast`, or `!f`: the letter alone is enough.** With it on, a command runs the moment its letter
is typed, with no <kbd>Enter</kbd>. The full names stop working while it is on, because the first
letter has already run the command by the time the rest arrives: `!short` typed in full puts the
hints up at `!s` and then presses `h`, `o`, `r` and `t` as hints. It is kept in local storage, so
it lasts when Firefox closes and every tab hears of it at once, and Preferences has a box for the
same switch. A bold **F** beside the bar says it is on.

**A command leaves the box empty.** `!help` used to stay in the box once it had run, so the
next key added to it and <kbd>Enter</kbd> only ran it again: getting back to searching meant
deleting it by hand. Now every command empties the box, ready for the next thing. What `!help`
shows stays up until the next key, which puts it away and then does what it always does;
<kbd>Esc</kbd> and <kbd>Ctrl</kbd>+<kbd>Space</kbd> put it away as their first step back.

**`!1` to `!9` go to a tab, and `!last` goes back to the one before.** A number goes to the tab
at that place in this window, counted from the left as the tab strip shows them, and runs as
soon as it is typed, since there is nothing more to type. `!last`, or `!l`, goes back to the tab
you were on before this one, in whichever window; again comes straight back. Firefox says which
tab is switched to, and the order is kept in session storage, because the background script is
stopped when idle and would forget it; it goes when Firefox closes. Until there is an order to
go by, `!last` takes the tab in this window that was left most recently.

---

## 1.3.1 - 24 September 2026

A spelling correction. The long dashes in the comments, the README, this history and the
two lines UOKey puts on screen are ordinary ones now. Nothing else changed.

---

## 1.3.0 - 24 September 2026

**Menus that only the mouse could open.** Enter on something that opens a menu did nothing when
the page was waiting for the pointer rather than for a click - a submenu of a menu is the usual
case, and the model picker in Claude Code is one of them. Nothing was ever told the pointer had
arrived, because only the click itself was mimicked.

The pointer arrives before every click now, the way a real mouse does, and something shut that
opens when it is used is given each way in, one at a time, stopping as soon as it is up: the
pointer, then the click, then <kbd>Enter</kbd>, then the key that kind of menu opens sideways or
downwards with. Nothing is pressed twice, because each step only happens if the last one left the
thing shut - a disclosure that opens on a plain click is clicked once and no key follows, and one
already open is shut rather than opened again. What counts as shut is what the page says about
itself: `aria-expanded`, `aria-haspopup`, `data-state`, or a `<details>` around a `<summary>`.

A menu that has just been opened is left holding the keyboard, since most of them shut the moment
it leaves them. Nothing is lost by it: what you type is still the bar's wherever the keys land, so
you can search what has just opened and press <kbd>Enter</kbd> on what is in it. A panel or a
disclosure stays open whatever has the keyboard, so for those the cursor goes back in the box as
before. The bar says `↵ open`, `↵ expand` or `↵ close` instead of `↵ click`.

**`!back` is Esc for the page.** <kbd>Esc</kbd> in the bar is the bar's own - it backs out of the
hints or a list, then closes the bar - so the page never sees it, and there was no way to shut a
menu, a submenu or a dialog without putting UOKey away too. `!back` presses it in the page
instead and leaves the bar where it was. It goes where the keyboard is, including into a frame
holding it. What the browser itself put in the top layer answers no key an extension can press,
so a dialog or popover still up a moment later is asked to go away in its own right - after its
`cancel`, which the page can still refuse.

---

## 1.2.0 - 23 September 2026

**Scrolling, without leaving the keyboard.** <kbd>&lt;</kbd> and <kbd>&gt;</kbd> nudge the page
along and <kbd>PageUp</kbd> and <kbd>PageDown</kbd> take it a screen at a time, while the bar is
open. Held down, the key repeats on its own and the page keeps going.

What moves is whatever the match you are on sits in, so a long menu, a chat panel or a list of
results scrolls on its own rather than the page behind it; one that has reached its end is
stepped over, so the page takes the key instead of the last press doing nothing. With nothing
found yet, or nothing that scrolls around the match, the page moves. A match inside a frame
scrolls what holds it in there, and the page behind if that frame has nothing to scroll.

It works while the hints are up as well, which is where it is worth most: `!short` puts a hint on
everything clickable, not only what is on screen, so scrolling brings the rest of them into reach
under the keys they already have.

<kbd>&lt;</kbd> and <kbd>&gt;</kbd> cost what they are worth. They were ordinary searchable text
before, so text with one in it - `<div>` in a page of HTML, the `>` in a row of breadcrumbs -
can no longer be searched for. That buys a scroll key that is under the fingers already instead
of across the keyboard.

---

## 1.1.0 - 23 September 2026

**The hints wait for whatever a click opens.** Pressing a hint that opens a menu, a dialog or a
cookie wall used to work the hints out while the click was still happening, which is before the
new thing exists - so the thing you had just opened was the one part of the page with no hint on
it, and you had to leave `!short` and come back. The hints are now worked out again once the page
stops changing, and at the latest a moment later, so a menu that fades in is hinted when it has
arrived rather than while it is still on its way.

**<kbd>Space</kbd> works the hints out again**, for a page that has put something up on its own
rather than because you clicked. No hint is spelled with a space, so nothing was given up for it.

**The hints are see-through.** The colour gives way and the letter stays as dark as it was,
because the letter is the one thing on a hint that has to be read. The hints you can no longer
press, once you have typed the first letter of one, sit furthest back of all.

**Clicking a field no longer switches UOKey off.** A field has to have the cursor for you to type
in it, so the bar steps out of the way - but it was saying it had been switched off when it did,
which put the bar away in every other tab and kept it away on every page opened afterwards. A
page can hide a field behind anything, so this happened far more often than it sounds: on
learngitbranching.js.org the home icon is a `<label>` for the terminal, and pressing its hint
switched UOKey off across the browser. Stepping aside is now just stepping aside.

**The bar comes back when you are done typing.** <kbd>Enter</kbd> in the field it stepped aside
for brings it back with the keyboard, and so does <kbd>Ctrl</kbd>+<kbd>Space</kbd>. In a text box
that takes more than one line, Enter breaks a line and the bar stays out of the way; it counts as
done only when the line was sent rather than broken.

**A field is found by what you have typed into it.** Fields were only ever indexed by their
placeholder, label or tooltip - and a search box you have already used is showing your words, not
its placeholder, so the one thing on screen was the one thing that could not be searched for.
Passwords are left out: what the screen stars out, UOKey does not read.

---

## 1.0.0 - 21 September 2026

The first version.

Press <kbd>Ctrl</kbd>+<kbd>Space</kbd>, type part of what a link, button or field says, and press
<kbd>Enter</kbd> to click it. Searches visible text as well as placeholders, labels, tooltips and
image descriptions, ignoring capitals, accents and which keyboard you type on. Anything the page
gives the hand cursor counts as clickable.

With `!short` for a hint key on everything at once, `!marks` for bookmarks, `!tabs` for open tabs
and `!help` for every key it uses. Runs in the page's frames as well, so a chat box, cookie wall
or payment field is part of the page. The bar is a switch for the whole browser, and stays on
through links and reloads until it is turned off.
