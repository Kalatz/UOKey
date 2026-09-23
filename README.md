<div align="center">

<img src="icons/icon.svg" alt="" width="170">

# UOKey

**Use Only Keyboard.** A Firefox extension: press Ctrl+Space, type part of what a link, button
or field says, and press Enter to click it.

[![Firefox 128+](https://img.shields.io/badge/Firefox-128%2B-ff701e?logo=firefoxbrowser&logoColor=white)](https://www.mozilla.org/firefox/)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-000033)](manifest.json)
[![Version 1.2.0](https://img.shields.io/badge/version-1.2.0-000033)](CHANGELOG.md)
[![Data collected: none](https://img.shields.io/badge/data%20collected-none-2ea043)](#permissions)

</div>

---

## Using it

Press <kbd>Ctrl</kbd>+<kbd>Space</kbd>. A small bar opens at the bottom of the page. Type part of
the text of a link, button or field — `searc` for Amazon's "Search Amazon" box. Every match is
highlighted, and <kbd>Enter</kbd> clicks the orange one; if it is a text field, Enter puts the
cursor in it instead, so you can type.

```text
╭─────────────────────────────────────────────╮
│ searc                                       │   1/3   ↵ type here
╰─────────────────────────────────────────────╯
```

Beside the box: which match you are on out of how many, and what Enter will do to it. Nothing
else shows until you ask. The bar moves to the top of the page when it would cover the match.

| Keys | What they do |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Space</kbd> | open the bar, or back out of it |
| <kbd>Enter</kbd> | click the orange match, or start typing in it if it is a field |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | open a link, or a bookmark, in a tab behind this one |
| <kbd>Tab</kbd> or <kbd>↓</kbd> | next match |
| <kbd>Shift</kbd>+<kbd>Tab</kbd> or <kbd>↑</kbd> | previous match |
| <kbd>&lt;</kbd> and <kbd>&gt;</kbd> | nudge whatever the match sits in, or the page; hold to keep going |
| <kbd>PageUp</kbd> and <kbd>PageDown</kbd> | the same, a screen at a time |
| <kbd>Esc</kbd> | close the bar and go back to where you were |

It searches visible text, and also placeholders, labels, tooltips and image descriptions (alt
text), and whatever you have already typed into a field — so a search box you have half filled in
is found by your own words, not by the placeholder it has stopped showing. Passwords are left out:
what the screen stars out, UOKey does not read. Capitals and accents make no difference, so `οδος` finds `Οδός`. Anything the page gives
the hand cursor counts as clickable, which is how most of the web builds a button out of a plain
`div`.

> [!TIP]
> To use a different shortcut: `about:addons` → ⚙ → **Manage Extension Shortcuts**. Whatever you
> pick works on any keyboard layout. If Firefox's address bar has the keyboard when you press it,
> the bar says **Press F6 to type here**.

---

## Commands

Anything typed starting with `!` is a command for UOKey rather than text to look for. Type `!` on
its own to see the list.

| Command | What it does |
| --- | --- |
| `!help` | what UOKey does, and every key it uses |
| `!short` | put a hint key on everything clickable |
| `!marks` | find one of your bookmarks and open it |
| `!tabs` | find one of your open tabs and go to it |

**`!short`** puts a small key under every link, button and field on the page. Press that key on
its own to click the thing it belongs to. The hints stay up afterwards, worked out afresh each
time, so you can press one button after another — including on whatever the last press opened,
which is waited for rather than missed. <kbd>Space</kbd> works them out again by hand, for a page
that has put something up on its own. `!short` again, or <kbd>Esc</kbd>, puts them away.

**`!marks`** searches your bookmarks by name, address or folder. They are listed in the folders
you keep them in, with the bookmarks toolbar first and open and the rest shut until you press
one. <kbd>Enter</kbd> opens a bookmark or turns a folder; <kbd>Esc</kbd> goes back to searching
the page.

**`!tabs`** searches your open tabs by title and address. <kbd>Enter</kbd> goes to one, bringing
its window forward if it is in another. Tabs in this window come first.

---

## Good to know

- **The bar is a switch for the whole browser.** Turn it on and it is waiting in every tab and on
  every page you open, through links and reloads, until you turn it off. Only Ctrl+Space, Esc or a
  real mouse click on the page puts it away; closing Firefox forgets it.
- **Ctrl+Space and Esc back out one step at a time**: the hints or a list first, then the bar.
- **Enter leaves the bar open** and empties the box, ready for the next thing. The one exception
  is a text field: the cursor has to go into the field for you to type, so the bar steps aside
  until that typing is done. It comes back when you press <kbd>Enter</kbd> in the field, or as
  soon as you press <kbd>Ctrl</kbd>+<kbd>Space</kbd>. Stepping aside is not switching UOKey off:
  your other tabs keep theirs, and the next page you open still has it.
- **While the bar is open, what you type is the bar's**, wherever the cursor happens to be — even
  when a cookie wall or a modal dialog has grabbed the keyboard.
- **Popups that are pages of their own count as part of the page.** UOKey runs in every `<iframe>`
  too, so matches and hints inside a chat box, cookie wall or payment field are found along with
  the rest.

---

## Install

**To keep it** (signed, and not published — the add-on is never listed or shown to anyone else):

1. Run `./build.sh`, which puts `uokey-<version>.zip` in this folder.
2. Sign in at [addons.mozilla.org](https://addons.mozilla.org/developers/addon/submit/distribution)
   and choose **On your own**.
3. Upload the zip; signing takes a minute or two.
4. Download the signed `.xpi` and open it in Firefox.

For a new version, raise `version` in [`manifest.json`](manifest.json) first — Firefox will not
install a version it already has — and note what changed in [`CHANGELOG.md`](CHANGELOG.md).

**To try it** (gone again when Firefox closes): open `about:debugging#/runtime/this-firefox`,
click **Load Temporary Add-on…**, pick `manifest.json`, and reload the tabs you want it in.

---

## Permissions

UOKey only reads these, and nothing is sent anywhere.

| What Firefox asks for | What it is for |
| --- | --- |
| **Access your data for all websites** | Reading the page in front of you: the text of its links, buttons and fields |
| **bookmarks** | `!marks` |
| **tabs** | `!tabs` |
| **storage** | Keeping the site icons Firefox has already handed over, so none is ever fetched |

> [!IMPORTANT]
> Without **access your data for all websites** the bar will not open anywhere. If it was turned
> down, or turned off later, `about:addons` → UOKey → **Preferences** says so and has a button to
> ask again.

---

## Limitations

- Firefox lets no extension run on its own pages, so the bar doesn't open on a new tab or the home
  page, on any other `about:` page, on addons.mozilla.org, or in the PDF viewer and Reader View.
- A frame UOKey is not allowed into — a sandboxed one, or one on a page of that kind — is a blank
  to it.
- Text that is part of a picture is only found if the picture has alt text.
