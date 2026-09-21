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

Your **bookmarks toolbar comes first and open**, since it is the one you arranged to be at
hand. Every other folder is shut, shown as its name and how many are in it. A folder is a row
like any other: move to it and press Enter to open it, Enter again to shut it. That goes for the
toolbar too, so you can shut that as well and start from nothing. It keeps the whole thing to
about a screenful however many bookmarks you have.

Plenty of toolbar bookmarks are saved with no name at all, so that the toolbar shows only their
icon. A blank is no use in a list, so those are shown as the site they are on followed by the
rest of the address — `127.0.0.1` then `/page3.html` — instead of a blank beside a repeat of the
same site.

Each folder's bookmarks are laid out side by side rather than in one long column, which halves
how far there is to scroll, and the address beside each name is only the site it is on:
`github.com`, not `https://www.github.com/kalatz/uokey/issues/new`. The name already says which
page it is. Typing still looks at the whole address, so a word from the part that isn't shown
will still find it.

Each one carries the site's own icon where UOKey has one, and a small square with the site's
first letter, coloured from the address, where it hasn't.

The icons are never fetched. Firefox hands one over whenever a tab settles on a page, and those
are kept, so a site you have visited shows its real icon in `!marks` and `!tabs` without a single
request going out and without telling any site what you have bookmarked. A site you have never
opened keeps its letter. Remembering them is what the **storage** permission is for; it holds
nothing but a list of sites and their icons, and never more than 400 of them.

## Hints: !short

Type `!short` and every link, button and field on the page gets a small key just below it.
Press that key on its own to use it. Typing `!short` again puts the hints away, so the command is a switch
rather than a button; Esc does the same.

Using a hint does not put the hints away. They are worked out again for the page as it now
stands, so you can press one button after another without reaching for anything.

`!short` is about the page in front of you and nothing else: it puts no keys on the screen but
the ones belonging to things you can click. The bar says how many it found, so a page where
nothing is clickable says so rather than looking broken.

Clickable means more than links and buttons. Most of the web builds its buttons out of plain
`div`s with a click handler and a hand cursor, and those get hints too — if the page gives
something the hand cursor, UOKey treats it as clickable. A wrapper with a hand cursor around a
real link is left alone, so you get one hint for the link rather than two for the same thing.

A `%` in front of a hint key still works, which is how this used to be done, but nothing needs
it. Anything starting with `!` still goes to the bar as a command, which is why `!short` can
switch the hints off from inside the hints.

While the hints are up the box is not for typing in, so the arrow keys, Home, End, Page Up and
Page Down do nothing at all rather than dragging a cursor about inside it.

Hints are one letter each while they fit and two when they don't, so no hint is ever the start
of another one and nothing waits to see what you type next. They are handed out along the home
row first — `a s d f g h j k l` — so the ones you reach for most are under your fingers. Esc puts
the hints away and leaves the bar open; Esc again closes it.

The bar is also kept at the very end of the page, so a popup the page throws up afterwards —
a cookie wall, a newsletter box — cannot sit on top of it. The highest z-index there is still
loses to whatever was added last and asked for the same, so being last is the part that matters.

A dialog the page opens with `showModal()`, and anything it shows as a popover, isn't in the
page's stacking order at all: Firefox puts it in a layer of its own above everything. Being last
in the page wins nothing against that, so the bar goes into that layer too, and back on top of it
whenever the page puts something new there.

## It stays until you say otherwise

Ctrl+Space backs out one step at a time, like Esc: the first press leaves the hints or a list,
and only once there is nothing left to leave does it switch the bar off.

Ctrl+Space is a switch for the whole browser, not for the page you happen to be on. Turn it on
and the bar is there on every page you open and in every tab, until you turn it off again or
close Firefox. Following a link or a bookmark doesn't count as turning it off: the bar is waiting
on the page you land on.

Clicking a link or a button with it, using a hint, or losing the keyboard to something on the
page doesn't put it away either. Only Ctrl+Space again, Esc, or a real mouse click somewhere on
the page. Reloading the page doesn't, and nor does leaving a tab alone long enough for Firefox to
put UOKey to sleep: the switch is kept until Firefox itself closes.

Popups have a habit of taking the keyboard as they open, and some hold on to it. The bar takes it
back, and if the page won't let go it stops pulling rather than fighting it forever — the keys go
to the bar either way. **While the bar is open, what you type is the bar's**, wherever the cursor
happens to be, so a cookie wall that has grabbed the keyboard, or a modal dialog that Firefox
won't let the bar be focused behind, leaves the bar working all the same. Typing goes on the end
of the box and Backspace takes it off again.

The one thing that still closes it by itself is Enter on a text field, because the cursor has to
be in the field rather than in the bar for you to be able to type. Enter on anything else leaves
the bar open and empties the box, ready for the next thing rather than still holding the last.

Reading your bookmarks and your open tabs is why UOKey asks for the **bookmarks** and **tabs**
permissions when you install it, and keeping site icons is what **storage** is for. It only
reads them, and nothing is sent anywhere.

## Frames: the popups that are pages of their own

A good deal of what looks like part of a page isn't: a help widget, a chat box, a cookie wall, a
payment field. Each is an `<iframe>` — a page of its own, dropped into a hole in the one you are
reading — and a page cannot read what is inside one.

UOKey runs in every frame as well, so all of it counts as one page. Type and the matches in a
widget are found along with the rest; `!short` puts hints in there too, and Tab walks from the
page into a frame and out the other side without anything to say it has.

The keys are handed out as one run across the page and everything in it, so a hint in the page is
never the start of a hint inside a frame: whatever you press means one thing only. A page that has
frames waits a moment for them to say what they have before the hints go up. A page that has none
puts them up as fast as it always did.

The bar itself is only ever in the page, never in the frames, however many there are. When one of
them has the keyboard — a help box that opens with the cursor already in its search field — what
you type is passed out to the bar, so the bar goes on working from in there without having to take
the cursor off what the frame has just put it in.

## Running on the pages you visit

UOKey works by reading the page in front of you — the text of its links, buttons and fields — so
Firefox needs your permission to let it onto the sites you visit. That is the **access your data
for all websites** permission, and without it UOKey can do nothing at all: the bar will not open
anywhere, because the part of it that lives in the page never starts.

Firefox asks when you install it. If it was turned down, or turned off later, UOKey's own
preferences page says so and has a button to ask again: `about:addons` → UOKey → **Preferences**.
The same page under **Permissions** has Firefox's own switch for it.

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

## Installing it to keep

Firefox throws away a temporary add-on when it restarts, so to have UOKey there every morning it
has to be signed. Signing is free, and it does not mean publishing: **On your own** gives you a
signed file to install yourself, and the add-on is never listed, never searchable, and never
shown to anybody else.

1. Run `./build.sh`, which puts `uokey-<version>.zip` in this folder.
2. Sign in at <https://addons.mozilla.org/developers/addon/submit/distribution> with a Firefox
   account, and choose **On your own**.
3. Upload the zip. It is checked there and then; signing takes a minute or two.
4. Download the signed `.xpi` and open it in Firefox. Firefox asks to add it, lists what it
   wants to be allowed, and keeps it from then on.

To put a new version out, raise `version` in `manifest.json` — Firefox will not install a
version it already has, or an older one — then build, upload and install it again.

## Installing it for testing

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. Reload the tabs you want to use it in.

After you edit the code, click **Reload** next to UOKey on that page, then reload the tab. This
is the one to use while working on it: it needs no signing and takes a second, and it is gone
again when Firefox closes.

## Limitations

- Firefox doesn't let extensions run on its own pages, so the bar doesn't open on a new tab or the
  home page (`about:newtab`, `about:home`), on any other `about:` page, on addons.mozilla.org, or in
  the PDF viewer and Reader View. Nothing an extension can do changes this.
- For the same reason, `!short` can't put its hints on Firefox's own toolbar. Back, forward, home
  and the bookmarks get a strip inside the page instead, and the keys still work.
- A frame UOKey is not allowed into — a sandboxed one, or one on a page Firefox keeps
  extensions off — is a blank to it, the same way a whole page of that kind is.
- Text that is part of a picture can only be found if the picture has alt text.
