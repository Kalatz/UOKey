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
| % then a hint key | use that hint, while the hints are up |
| !marks | find one of your bookmarks and open it |

Anything typed starting with `!` is a command for UOKey instead of text to look for on the page, so
`!help` opens a panel above the bar with what UOKey does and every key it uses, the shortcut named
as it is actually set. Typing `!` on its own lists the commands there are.

## Bookmarks: !marks

Type `!marks` and the bar looks through your bookmarks instead of the page. Type part of a title
or an address, and the panel lists what matches; Tab and the arrow keys move down the list, Enter
opens the one that is highlighted, and Esc goes back to searching the page.

It is the same typing you already use for links and buttons, so there is nothing new to learn,
and it covers every bookmark you have rather than only the ones on the toolbar.

## The new tab and home page

Firefox doesn't let an extension run on `about:newtab` or `about:home`, so the bar could never
open on the page a new tab starts at. UOKey now stands in for that page instead: new tabs, and
the home button, open a page UOKey serves, where the bar and the hints work normally. It shows
your most visited sites and your bookmarks toolbar.

Firefox asks you before it lets any extension take over those, and you can hand them back at any
time — the new tab page under `about:addons`, and the home page under **Settings → Home**.

Reading your most visited sites is what the **topSites** permission is for.

## Hints: !short

Type `!short` and every link, button and field on the page gets a small key above it. Press `%`
and then that key to use it. Ordinary typing still searches the page, which is what the `%` is
for: it marks the next key or two as a hint rather than text to find.

Back, forward, home and your bookmarks toolbar get keys too, in a strip above the bar:

| Key | What it does |
| --- | --- |
| %b | back |
| %f | forward |
| %h | your home page |
| %1 %2 %3 … | the bookmarks on your bookmarks toolbar, left to right |

The strip is UOKey's own, drawn in the page. Firefox doesn't let an extension draw anything on
its real toolbar, so the hints can't sit next to the actual back, forward and bookmark buttons —
but the keys do the real thing.

Page hints are one letter each while they fit and two when they don't, so no hint is ever the
start of another one and nothing waits to see what you type next. `b`, `f` and `h` are never
given to the page, so they always mean back, forward and home. Esc puts the hints away and
leaves the bar open; Esc again closes it.

Reading your bookmarks and your home page setting is why UOKey asks for the **bookmarks** and
**browser settings** permissions when you install it. It only reads them, and nothing is stored
or sent anywhere.

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

- Firefox doesn't let extensions run on its own pages. UOKey works around that for the new tab and
  home page by standing in for them, but there is no way around it for other `about:` pages,
  addons.mozilla.org, the PDF viewer or Reader View: the bar will not open there.
- For the same reason, `!short` can't put its hints on Firefox's own toolbar. Back, forward, home
  and the bookmarks get a strip inside the page instead, and the keys still work.
- Links inside embedded frames (iframes) aren't searched. On a non-Latin layout the shortcut also
  needs the cursor to be outside an embedded frame, because that is where UOKey can watch for it.
- Text that is part of a picture can only be found if the picture has alt text.
