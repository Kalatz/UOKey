# UOKey

A Firefox extension that lets you click things with the keyboard instead of the mouse.

Press **Ctrl+Space**. A small search bar opens at the bottom of the page. Type part of the text
of a link, button or field, for example `searc` for Amazon's "Search Amazon" box or `sharp` for its
"Start looking sharp" card. Every match is highlighted, and **Enter** clicks the orange one. If the
match is a text field, Enter puts the cursor in it instead so you can type.

| Keys | What they do |
| --- | --- |
| Ctrl+Space | open the bar (press again to close it) |
| Enter | click the orange match, or start typing in it if it is a field |
| Tab or ↓ | next match |
| Shift+Tab or ↑ | previous match |
| Esc | close the bar and go back to where you were |
| !help | show all of this in the bar itself |
| !short | put a hint key on everything clickable |
| a hint key | use that hint, while the hints are up |
| !marks | find one of your bookmarks and open it |
| !tabs | find one of your open tabs and go to it |
| Shift+Enter | open a link, or a bookmark, in a tab behind this one |

Anything typed starting with `!` is a command for UOKey instead of text to look for on the page, so
`!help` opens a panel above the bar with what UOKey does and every key it uses, the shortcut named
as it is actually set. Typing `!` on its own lists the commands there are.

## Tabs: !tabs

Type `!tabs` and the bar looks through the tabs you have open, by their titles and addresses.
Enter goes to the one highlighted, bringing its window forward if it is in another one. Tabs in
the window you are in are listed first, and the one you are reading is marked.

It searches what the tab is called, not what is on the page, so a tab titled `Page3` is found by
`page3` rather than by words further down it.

## Opening in a new tab

Hold **Shift** (or Ctrl) with Enter and a link opens in a tab behind the one you are in, leaving
you where you are. It works on a match in the page and on a bookmark in `!marks`.

Only links can do this: a button or a field has nowhere of its own to go, so Shift+Enter clicks
or focuses it exactly as plain Enter would.

## Bookmarks: !marks

Type `!marks` and the bar looks through your bookmarks instead of the page. Type part of a title
or an address, and the panel lists what matches; Tab and the arrow keys move down the list, Enter
opens the one that is highlighted, and Esc goes back to searching the page.

It is the same typing you already use for links and buttons, so there is nothing new to learn,
and it covers every bookmark you have rather than only the ones on the toolbar.

They are listed in the folders you keep them in, so a long list reads like your bookmark menu
rather than one run of names. Folder names count as something to type, too: `work` finds
everything in a Work folder, whatever the bookmarks in it are called.

Each one carries a small square with the site's first letter, coloured from the address, so two
bookmarks on the same site look alike at a glance. They are not the sites' real favicons:
Firefox keeps those where an extension can't read them, and the only other way to get one is to
ask each bookmarked site for it, which would tell all of them what you have kept.

## Hints: !short

Type `!short` and every link, button and field on the page gets a small key above it. Press that
key on its own to use it. Typing `!short` again puts the hints away, so the command is a switch
rather than a button; Esc does the same.

Using a hint does not put the hints away. They are worked out again for the page as it now
stands, so you can press one button after another without reaching for anything.

Every hint is also listed above the bar, in a table grouped into **Browser**, **Bookmarks
toolbar** and **On this page**, each key next to the name of what it does. That list is the whole
of it, including the links too far down the page to have a visible key on them yet, so `!short`
tells you everything you can reach rather than only what is in front of you.

Back, forward, home and your bookmarks toolbar get keys too:

| Key | What it does |
| --- | --- |
| b | back |
| f | forward |
| h | your home page |
| 1 2 3 … | the bookmarks on your bookmarks toolbar, left to right |

A `%` in front of a hint key still works, which is how this used to be done, but nothing needs
it. Anything starting with `!` still goes to the bar as a command, which is why `!short` can
switch the hints off from inside the hints.

While the hints are up the box is not for typing in, so the arrow keys, Home, End, Page Up and
Page Down do nothing at all rather than dragging a cursor about inside it.

The strip is UOKey's own, drawn in the page. Firefox doesn't let an extension draw anything on
its real toolbar, so the hints can't sit next to the actual back, forward and bookmark buttons —
but the keys do the real thing.

Page hints are one letter each while they fit and two when they don't, so no hint is ever the
start of another one and nothing waits to see what you type next. `b`, `f` and `h` are never
given to the page, so they always mean back, forward and home. Esc puts the hints away and
leaves the bar open; Esc again closes it.

## It stays until you say otherwise

The bar opens on Ctrl+Space and stays open. Clicking a link or a button with it, using a hint, or
losing the keyboard to something on the page no longer puts it away: only Ctrl+Space again, or
Esc, or a real mouse click somewhere on the page.

The one thing that still closes it by itself is Enter on a text field, because the cursor has to
be in the field rather than in the bar for you to be able to type.

Reading your bookmarks, your open tabs and your home page setting is why UOKey asks for the
**bookmarks**, **tabs** and **browser settings** permissions when you install it. It only reads
them, and nothing is stored or sent anywhere.

The bar keeps out of the way: it opens as nothing but the box to type in, centred at the bottom of
the page, and says nothing about commands or keys until you ask. The match count and what Enter
will do appear beside the box once you start typing, without ever moving it off centre.

It searches the visible text of links, buttons and anything with a pointer (hand) cursor. It also
searches field placeholders, labels, tooltips and image descriptions (alt text). Capitals, accents
and final sigma don't matter, so `αναζητηση`, `ΑΝΑΖΗΤΗΣΗ` and `Αναζήτηση` all find each other, and
`οδος` finds `Οδός`.

The shortcut works whatever your keyboard is set to type. The spacebar is in the same place on
every keyboard, so Ctrl+Space works on all of them. A shortcut you change to a letter in
`about:addons` works everywhere too: Firefox on its own would only recognise Ctrl+Shift+F when the
keyboard makes a Latin `f`, so on a Greek layout, where those keys type `Φ`, UOKey watches for them
itself, going by where the keys are rather than by what they type. Caps Lock makes no difference
either.

If Firefox's address bar has the keyboard when you press the shortcut, the bar says **Press F6 to
type here**: Firefox doesn't let a page take the keyboard from its own toolbar, and F6 moves it to
the page.

To use a different shortcut, open `about:addons`, click the ⚙ (gear) button, choose **Manage
Extension Shortcuts** and change it next to UOKey.

## Installing it for testing

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. Reload the tabs you want to use it in.

After you edit the code, click **Reload** next to UOKey on that page, then reload the tab.

Firefox removes temporary add-ons when it restarts. To keep UOKey installed, Mozilla has to sign
it. Signing is free and the extension can stay private:

1. Zip the contents of this folder, with `manifest.json` at the top level of the zip.
2. Upload the zip at <https://addons.mozilla.org/developers/addon/submit/distribution> and choose
   **On your own**.
3. Download the signed `.xpi` file and open it in Firefox.

## Limitations

- Firefox doesn't let extensions run on its own pages, so the bar doesn't open on a new tab or the
  home page (`about:newtab`, `about:home`), on any other `about:` page, on addons.mozilla.org, or in
  the PDF viewer and Reader View. Nothing an extension can do changes this.
- For the same reason, `!short` can't put its hints on Firefox's own toolbar. Back, forward, home
  and the bookmarks get a strip inside the page instead, and the keys still work.
- Links inside embedded frames (iframes) aren't searched. On a non-Latin layout the shortcut also
  needs the cursor to be outside an embedded frame, because that is where UOKey can watch for it.
- Text that is part of a picture can only be found if the picture has alt text.
