<div align="center">

<img src="icons/icon.svg" alt="" width="150">

# UOKey

**Use Only Keyboard.** A Firefox add-on: press Ctrl+Space, type part of what a link, button
or field says, and press Enter to click it.

<a href="https://addons.mozilla.org/firefox/addon/uokey/"><img src="images/get-the-addon.svg" alt="Get the add-on for Firefox" height="58"></a>

[![Firefox 142+](https://img.shields.io/badge/Firefox-142%2B-ff701e?logo=firefoxbrowser&logoColor=white)](https://www.mozilla.org/firefox/)
[![Version 1.6.1](https://img.shields.io/badge/version-1.6.1-000033)](CHANGELOG.md)
[![Data collected: none](https://img.shields.io/badge/data%20collected-none-2ea043)](#permissions)
[![GitHub stars](https://img.shields.io/github/stars/Kalatz/UOKey?style=flat&logo=github&label=stars)](https://github.com/Kalatz/UOKey/stargazers)

<img src="images/search.png" alt="The UOKey bar at the bottom of a Wikipedia page: keyb typed in the box, every match highlighted, the first in orange, and beside the box 1/85 and open link" width="860">

</div>

---

## Using it

Press <kbd>Ctrl</kbd>+<kbd>Space</kbd>. A small bar opens at the bottom of the page. Type part of
the text of a link, button or field - `searc` for Amazon's "Search Amazon" box. Every match is
highlighted, and <kbd>Enter</kbd> clicks the orange one; if it is a text field, Enter puts the
cursor in it instead, so you can type.

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
text), and whatever you have already typed into a field - so a search box you have half filled in
is found by your own words, not by the placeholder it has stopped showing. Passwords are left out:
what the screen stars out, UOKey does not read. Capitals and accents make no difference, so `οδος`
finds `Οδός`. Anything the page gives the hand cursor counts as clickable, which is how most of the
web builds a button out of a plain `div`.

> [!TIP]
> To use a different shortcut: `about:addons` → ⚙ → **Manage Extension Shortcuts**. Whatever you
> pick works on any keyboard layout. If Firefox's address bar has the keyboard when you press it,
> the bar says **Press F6 to type here**.

---

## Commands

Anything typed starting with `;` is a command for UOKey rather than text to look for. Type `;` on
its own to see the list, and the tabs in this window with their keys. Every command but
`;github` also has a letter: `;s` and <kbd>Enter</kbd> is `;shortcut`.

| Command | Letter | What it does |
| --- | --- | --- |
| `;help` | `;h` | what UOKey does, and every key it uses |
| `;back` | `;b` | press Esc in the page, without closing the bar |
| `;shortcut` | `;s` | put a hint key on everything clickable |
| `;up` | `;u` | go to the top of the page |
| `;marks` | `;m` | find one of your bookmarks and open it |
| `;tabs` | `;t` | find one of your open tabs and go to it |
| `;last` | `;l` | go back to the tab you were on before this one |
| `;reload` | `;r` | work the hint keys and the tabs' keys out again |
| `;1` … `;9` | | go to that tab in this window |
| `;d0` … `;dz` | | unload that tab to free its memory; `;d0` is this one |
| `;github` | | open UOKey's page on GitHub |

<p align="center">
<img src="images/commands.png" alt="The list of commands UOKey shows when ; is typed on its own, from ;help to ;github" width="760">
</p>

**`;back`** presses <kbd>Esc</kbd> in the page itself, which shuts the menu, submenu or dialog
the page has open, and leaves the bar where it was. <kbd>Esc</kbd> on its own is the bar's: it
backs out of the hints or a list, and then closes the bar.

**`;shortcut`** puts a small key under every link, button and field on the page. Press that key on
its own to click the thing it belongs to. The hints stay up afterwards, worked out afresh each
time, so you can press one button after another - including on whatever the last press opened,
which is waited for rather than missed. <kbd>Space</kbd> works them out again by hand, for a page
that has put something up on its own. `;shortcut` again, or <kbd>Esc</kbd>, puts them away.

<p align="center">
<img src="images/hints.png" alt="A Wikipedia page with ;shortcut on: a small yellow two-letter key under every link, button and field" width="760">
</p>

**`;up`** goes to the top of the page. On a site that keeps everything in a panel of its own and
never scrolls the page itself, a mail or chat app say, it takes whatever has scrolled in the
middle of the screen to its top instead.

**`;marks`** searches your bookmarks by name, address or folder. They are listed in the folders
you keep them in, with the bookmarks toolbar first and open and the rest shut until you press
one. <kbd>Enter</kbd> opens a bookmark or turns a folder; <kbd>Esc</kbd> goes back to searching
the page.

**`;tabs`** searches your open tabs by title and address. <kbd>Enter</kbd> goes to one, bringing
its window forward if it is in another. Tabs in this window come first.

**`;1` to `;9`** go to the tab at that place in this window, counting from the left the way the
tab strip shows them. A number is a whole command already, so it runs as soon as it is typed,
with `;;fast` on or off. There is no `;10`: `;tabs` finds the rest by name. So that there is no
counting along the tab strip, `;` on its own lists the tabs in this window under the commands,
each with its key in yellow like the hints: `1` to `9`, and then `a` to `z` for the tenth tab to
the thirty-fifth. Click one to go there. The letters are for `;d` and clicking only, because a
letter straight after `;` is a command's. Firefox lets no add-on draw on the tab strip itself,
which is why they are listed rather than marked. `;;hints` turns the lists off, and on again.

**`;d0` to `;dz`** unload a tab, the way Firefox's own right-click → **Unload Tab** does: it stays
on the tab strip, greyed, and gives back the memory it held until you next go to it. After `;d`
comes the tab's key from the list, `1` to `9` and then `a` to `z`, so `;da` is the tenth tab;
`;d0` is the tab you are on, which UOKey first leaves for the next tab along that is still
loaded. It runs as soon as the key is typed. `;d` on its own lists the tabs with their keys, and
clicking one unloads it. The tab's icon fades to grey over three seconds first, as Firefox fades
a tab it unloads itself but not one an add-on unloads; the fade is drawn from the icon Firefox
already has, so nothing is fetched. Firefox puts a new icon on a tab only about every tenth of a
second, so the fade goes in about twenty-five small steps, each sent as soon as the last is on
the tab. A tab Firefox will not unload, because it has a dialog up or asks before it is left,
keeps its icon.

**`;last`** goes back to the tab you were on before this one, in whichever window it is. Doing it
again comes straight back, so it flips between two tabs. UOKey keeps the order you used your tabs
in until Firefox closes; just after it starts, before you have switched anywhere, `;last` goes to
the tab in this window you left most recently.

**`;reload`** works everything out again for a page or a window that has changed: the hint keys,
if the hints are up, the way <kbd>Space</kbd> does, and the tabs with their keys, which it
shows until the next key.

**`;github`** opens this repository in a new tab beside the one you are on. If UOKey is useful to
you, a star there helps other people find it.

### Settings

Two of the prefix, `;;`, are the settings. Type `;;` on its own to see them and which way each
is set; that list is always there, whatever the settings are, so one turned off can always be
turned on again. A switch is turned back by the same again, and stays the way you left it when
Firefox closes.

| Setting | Letter | What it does |
| --- | --- | --- |
| `;;hints` | `;;h` | list the commands and this window's tabs, with their keys, as `;` is typed (on to start with) |
| `;;fast` | `;;f` | run a command by its letter alone, with no Enter (off to start with) |
| `;;settings` | `;;s` | open UOKey's Preferences, which has both switches as well |

**`;;fast`** makes the letter the whole command: `;s` puts the hints up the moment it is typed,
with no <kbd>Enter</kbd>. While it is on, the full names stop working, because the first letter
has run the command before the rest arrives - typing `;shortcut` in full puts the hints up at
`;s` and then presses the hints `h`, `o`, `r`, `t`, `c`, `u` and `t`. While it is on, a small
**F** sits at the right-hand end of the box.

---

## Good to know

- **The bar is a switch for the whole browser.** Turn it on and it is waiting in every tab and on
  every page you open, through links and reloads, until you turn it off. Only Ctrl+Space, Esc or a
  real mouse click on the page puts it away; closing Firefox forgets it.
- **Ctrl+Space and Esc back out one step at a time**: `;help` first, then the hints or a list, then
  the bar.
- **A command leaves the box empty**, ready for the next thing. What `;help` shows stays up until
  the next key, which puts it away and then does what it always does.
- **Enter leaves the bar open** and empties the box, ready for the next thing. The one exception
  is a text field: the cursor has to go into the field for you to type, so the bar steps aside
  until that typing is done. It comes back when you press <kbd>Enter</kbd> in the field, or as
  soon as you press <kbd>Ctrl</kbd>+<kbd>Space</kbd>. Stepping aside is not switching UOKey off:
  your other tabs keep theirs, and the next page you open still has it.
- **Menus open for Enter as they do for the mouse.** UOKey moves the pointer onto a thing before
  it clicks it, so a menu that only opens when the mouse arrives opens all the same; if that is
  not what it was waiting for, the click follows, and then the keys a menu opens with. Nothing is
  pressed twice: each step only happens if the last one left the thing shut.
- **A menu keeps the keyboard while it is open**, because most shut the moment it leaves them.
  Keep typing - what you type is still the bar's - and `;back` shuts the menu again.
- **While the bar is open, what you type is the bar's**, wherever the cursor happens to be - even
  when a cookie wall or a modal dialog has grabbed the keyboard.
- **Popups that are pages of their own count as part of the page.** UOKey runs in every `<iframe>`
  too, so matches and hints inside a chat box, cookie wall or payment field are found along with
  the rest.

---

## Install

**From addons.mozilla.org:** open [UOKey's page there](https://addons.mozilla.org/firefox/addon/uokey/)
in Firefox 142 or newer and press **Add to Firefox**. Firefox lists what UOKey may do before it
adds it (see [Permissions](#permissions)) and keeps it up to date from then on.

**From the source**, to try a change (gone again when Firefox closes): open
`about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, pick `manifest.json`,
and reload the tabs you want it in. `./build.sh` packs the same files into the zip that
addons.mozilla.org signs.

---

## Permissions

These are the lines Firefox shows when you add UOKey, and what each one is needed for. UOKey only
reads, and nothing it reads is sent anywhere.

| Firefox asks to | What UOKey needs it for |
| --- | --- |
| **Access your data for all websites** | Reading the page in front of you: the text of its links, buttons and fields, so the bar can find them. Without it the bar opens nowhere. |
| **Read and modify bookmarks** | `;marks`, which searches your bookmarks. UOKey only reads them and never changes one. |
| **Access browser tabs** | `;tabs`, which searches your open tabs by title and address; the numbered tabs `;` lists, and `;d0` … `;dz`, which unloads them; and the site icons all of these show. |
| *Storage, which Firefox does not ask about* | The site icons Firefox has already shown, kept so that none is ever fetched; the two settings, `;;hints` and `;;fast`; and, until Firefox closes, whether the bar is on and the order you used your tabs in, for `;last`. |

> [!IMPORTANT]
> **Access your data for all websites** can be turned off later, in `about:addons` → UOKey →
> **Permissions**. If it is, the bar will not open anywhere, and `about:addons` → UOKey →
> **Preferences** says so and has a button to turn it back on.

---

## Limitations

- Firefox lets no extension run on its own pages, so the bar doesn't open on a new tab or the home
  page, on any other `about:` page, on addons.mozilla.org, or in the PDF viewer and Reader View.
- A frame UOKey is not allowed into - a sandboxed one, or one on a page of that kind - is a blank
  to it.
- Text that is part of a picture is only found if the picture has alt text.
- `;d0` … `;dz` fade a tab's icon through the copy of UOKey running in it, so a tab it cannot run
  in, one of Firefox's own pages, unloads without the fade.

---

> [!WARNING]
> UOKey was created with help from [Claude Code](https://claude.com/claude-code),
> an AI coding assistant made by Anthropic.

<div align="center">
<sub>
The screenshots show Wikipedia's <a href="https://en.wikipedia.org/wiki/Computer_keyboard">Computer keyboard</a> article, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
</sub>
</div>
