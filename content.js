/*
 * UOKey: click things on a page without the mouse.
 *
 * Press Ctrl+Space: a small search bar opens at the bottom of the page. Type part of the text
 * of a link, button or field (its visible text, placeholder, label or image alt text) and every
 * match is highlighted. Enter clicks the current match, or puts the cursor in it when it is a
 * text field. Tab / Shift+Tab (or Down / Up) move between matches, Esc closes the bar.
 *
 * Type ;shortcut instead and every clickable thing on the page gets a hint key just under it.
 * Press that key to use it; ;shortcut again, or Esc, puts them away.
 */
(() => {
  'use strict';

  // Elements that do something when clicked, or that take typing.
  const ACTIONABLE = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary', 'label',
    '[onclick]', '[contenteditable]:not([contenteditable="false"])',
    ...['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'checkbox',
      'radio', 'switch', 'option', 'treeitem', 'combobox', 'searchbox', 'textbox']
      .map((role) => `[role="${role}"]`),
  ].join(',');

  // Elements whose text is not shown as page text.
  const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'head', 'title', 'svg',
    'math', 'textarea', 'select', 'option', 'optgroup', 'datalist', 'iframe', 'frame', 'object',
    'embed', 'canvas', 'video', 'audio']);

  // Inline formatting tags. Crossing any other element boundary counts as a word break.
  const INLINE_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del',
    'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong',
    'sub', 'sup', 'time', 'u', 'var', 'wbr']);

  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number',
    'date', 'datetime-local', 'month', 'week', 'time']);
  // Fields whose contents count as their text, for finding them by. A password is not among
  // them: it is starred out on screen, and what the screen hides UOKey hides too.
  const TYPED_TEXT_TYPES = new Set([...TEXT_INPUT_TYPES].filter((type) => type !== 'password'));

  // Attribute changes that affect the index: labels, and whether something is clickable.
  const INDEXED_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'value',
    'href', 'role', 'onclick', 'contenteditable', 'type']);

  const VISIBILITY = {
    opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true,
  };
  const IGNORABLE = /[\p{M}\p{Cf}]/gu; // accents, soft hyphens, zero-width and direction marks
  const DEFAULT_SHORTCUT = 'Ctrl+Space';
  const SAME_PRESS = 1000; // ms; Firefox's own shortcut arriving after we handled the same keys
  // The shortcut can reach the page twice over: Firefox's own command, and the frame that had
  // the keyboard, which watches for the keys itself. Neither is reliably first, so two reports
  // this close together are taken for the one press.
  const DOUBLE_PRESS = 120; // ms
  // Where the keys Firefox lets a shortcut use sit on the keyboard, for the ones that aren't
  // letters or digits.
  const KEY_CODES = {
    Comma: 'Comma', Period: 'Period', Space: 'Space', Home: 'Home', End: 'End',
    PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete',
    Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
  };
  const ONE_LETTER_DELAY = 200; // ms to wait for a second letter before searching for just one
  // A page that answers being given the keyboard back by taking it again, over and over, is a
  // focus trap rather than a page opening something: this many goes that close together and the
  // bar stops pulling, and works from wherever the keys land instead.
  const FOCUS_FIGHT_LIMIT = 6;
  const FOCUS_FIGHT_WINDOW = 400; // ms
  const HINT_WAIT = 150; // ms given to the page's frames to say how much they have to hint
  // A hint that opens something - a menu, a dialog, a cookie wall - changes the page a moment
  // after the click rather than during it, so hints worked out there and then are worked out on
  // the page as it was. This is how long the page has to go quiet before they are worked out
  // again, and how long that is waited for at all, however restless the page.
  const SETTLE_QUIET = 120; // ms
  const SETTLE_LIMIT = 1200; // ms
  const REINDEX_AFTER = 1000; // ms; while typing, re-read a page that keeps changing at most this often
  const MAX_SCAN = 3000; // text occurrences examined per search
  const MAX_MATCHES = 300; // matches kept per search
  const FIXED = { clips: [], scrolls: false, fixed: true };
  const PLACEHOLDER = 'Find a link, button or field…';
  // Typing this instead of text to find asks UOKey itself for something. It sits under the
  // little finger on a Latin keyboard's home row, and no page text starts with it, so nothing
  // that can be clicked is ever out of reach behind it.
  const COMMAND_PREFIX = ';';
  // Two of it are the settings, which are commands as well: ;;hints, ;;fast and ;;settings.
  const SETTINGS_PREFIX = COMMAND_PREFIX.repeat(2);
  // In ;shortcut, this marks the next key or two as a hint rather than text to find on the page.
  const HINT_PREFIX = '%';
  // Home row first, so the hints that get handed out first are the easiest to reach. All one
  // letter while they fit and all two when they don't, so no hint is the start of another.
  const HINT_ALPHABET = 'asdfghjklqwertyuiopzxcvbnm';
  const MAX_HINTS = 676; // as many as two letters of the alphabet can name
  const TAG_OVER = 2; // px a hint sits over the bottom edge of its thing, so they read as one
  // A menu that opens when the pointer arrives takes a moment about it, and clicking something
  // already open would shut it again: how long each step waits to see before the next one tries.
  const HOVER_OPEN = 150; // ms the pointer is left on a thing before the click follows
  const KEY_OPEN = 120; // ms the click is given before the keys a menu opens for try instead
  const OPEN_GRACE = 700; // ms something just opened has to say so before the bar takes the keys
  // What aria-haspopup says hangs off a thing: a menu of some kind rather than nothing at all.
  const POPUP_KINDS = new Set(['true', 'menu', 'listbox', 'tree', 'grid', 'dialog']);
  // What the widget libraries write in data-state while what a thing opens is up, or is not.
  const OPEN_STATES = new Set(['open', 'expanded', 'visible']);
  const CLOSED_STATES = new Set(['closed', 'collapsed', 'hidden']);
  // The old numbers of the keys UOKey presses for the page; plenty of pages still read them.
  const KEY_NUMBERS = { Enter: 13, Escape: 27, ArrowLeft: 37, ArrowRight: 39, ArrowDown: 40 };
  // Each command but ;github also has a letter: ;s and Enter is ;shortcut. With ;;fast on, the
  // letter alone is the whole command and no Enter is needed. No two commands share one.
  const COMMANDS = [
    { name: 'help', letter: 'h', summary: 'what UOKey does, and every key it uses', fill: fillHelp },
    { name: 'back',
      letter: 'b',
      summary: 'press Esc in the page, without closing the bar',
      run: pressEscape },
    { name: 'shortcut',
      letter: 's',
      summary: 'a hint key on everything clickable; press one to use it',
      run: startShort },
    { name: 'up', letter: 'u', summary: 'go to the top of the page', run: goUp },
    { name: 'marks',
      letter: 'm',
      summary: 'find one of your bookmarks by name and open it',
      run: () => startList('marks') },
    { name: 'tabs',
      letter: 't',
      summary: 'find one of your open tabs by name and go to it',
      run: () => startList('tabs') },
    { name: 'last',
      letter: 'l',
      summary: 'go back to the tab you were on before this one',
      run: () => tabCommand('last-tab', 'There is no tab to go back to') },
    { name: 'reload',
      letter: 'r',
      summary: 'work the hint keys out again, and the keys of the tabs',
      run: reload },
    { name: 'github',
      summary: 'open UOKey\'s page on GitHub, where a star helps other people find it',
      run: openGitHub },
  ];
  // ;; and then one of these. A setting is a switch: the same again turns it back, and it lasts
  // when Firefox closes. ;; on its own always lists them, whatever they are set to, so that one
  // turned off can always be found to turn on again.
  const SETTINGS = [
    { name: 'hints',
      letter: 'h',
      summary: `the commands and this window's tabs, as ${COMMAND_PREFIX} is typed`,
      on: () => showHints,
      run: toggleHints },
    { name: 'fast',
      letter: 'f',
      summary: 'a command\'s letter runs it straight away, with no Enter',
      on: () => fastCommands,
      run: toggleFast },
    { name: 'settings',
      letter: 's',
      summary: 'open UOKey\'s Preferences, which has these switches as well',
      run: openSettings },
  ];
  const GITHUB_PAGE = 'https://github.com/Kalatz/UOKey';
  // ;d and a tab's number unloads that tab, 0 being the one the bar is in. It is not a letter in
  // COMMANDS, because with ;;fast on a letter runs before the number could follow it.
  const UNLOAD = 'd';
  const NUMBERED_TABS = 9; // ;1 to ;9: there is no ;10
  // The key each tab goes by, in the order of the tab strip: 1 to 9 as ;1 to ;9 count them, and
  // then the letters, so that ;d reaches the tenth tab onwards as well. 0 is the one you are on.
  // A letter after ; alone is a command's, so the letters are for ;d and for clicking.
  const TAB_KEYS = '123456789abcdefghijklmnopqrstuvwxyz';
  // The <link> a tab's icon is faded through on its way to being unloaded (see showIcon).
  const ICON_ID = 'uokey-favicon';
  // Where ;;fast and ;;hints are kept, so that they last and every tab hears when they change.
  // Preferences writes the same places.
  const FAST_STORE = 'fastCommands';
  const HINTS_STORE = 'showHints';
  // Looking around without leaving the keyboard. < and > nudge it along and PageUp and PageDown
  // take it a screen at a time; held down, the key repeats on its own and the page keeps going.
  // < and > cost what they are worth: text with one in it stops being findable, which buys a
  // scroll key that is under the fingers already rather than across the keyboard.
  const NUDGE = 80; // px, about four lines
  const SCREENFUL = 0.9; // of the height, leaving a line or two to read across
  const MAX_LIST = 200; // bookmarks or tabs listed at once
  const SHORT_PLACEHOLDER = 'Press a hint key…';
  // A modifier held down on its own: nothing to pass out of a frame to the bar.
  const BARE_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);
  // Keys that move a cursor about: nothing for them to do while the hints are up.
  const DEAD_IN_HINTS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End', 'PageUp', 'PageDown']);

  // Firefox lets extensions look inside closed shadow roots as well as open ones.
  const shadowOf = 'openOrClosedShadowRoot' in Element.prototype
    ? (el) => el.openOrClosedShadowRoot
    : (el) => el.shadowRoot;

  const CSS = `
    .layer { position: fixed; inset: 0; overflow: hidden; pointer-events: none; }
    .hl, .outline { position: absolute; display: none; box-sizing: border-box; }
    .hl { border-radius: 3px; background: rgba(255, 221, 0, 0.38);
      box-shadow: 0 0 0 1px rgba(214, 160, 0, 0.9); }
    .hl.cur { background: rgba(255, 145, 0, 0.42); box-shadow: 0 0 0 2px #ff8a00; }
    .outline { border-radius: 6px;
      box-shadow: 0 0 0 2px #ff8a00, 0 0 0 6px rgba(255, 138, 0, 0.28); }
    .dock { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      max-width: calc(100vw - 32px); pointer-events: none; }
    .dock.top { top: 18px; bottom: auto; flex-direction: column-reverse; }
    .bar, .panel, .extras { box-sizing: border-box; max-width: 100%; border-radius: 12px;
      background: #1f2125; color: #e8e8ea; pointer-events: auto;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08); }
    .row { position: relative; display: flex; }
    .bar { position: relative; display: flex; padding: 7px; font: 13px/1.3 system-ui, sans-serif; }
    /* Beside the typing box, so that it stays where it is however much there is to say. */
    .extras { display: none; position: absolute; left: 100%; top: 0; bottom: 0; margin-left: 8px;
      align-items: center; gap: 10px; padding: 0 13px; overflow: hidden; white-space: nowrap;
      max-width: calc(50vw - 160px); font: 13px/1.3 system-ui, sans-serif; }
    .extras.on { display: flex; }
    /* ;;fast is on: a small F at the far end of the box, with the box's text kept clear of it. */
    .fast { display: none; position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
      padding: 2px 5px; border-radius: 4px; background: rgba(255, 177, 59, 0.16);
      box-shadow: inset 0 0 0 1px rgba(255, 177, 59, 0.55); color: #ffb13b;
      font: 700 10px/1.2 system-ui, sans-serif; }
    .bar.fast-on .fast { display: block; }
    .bar.fast-on input { padding-right: 32px; }
    input { all: unset; box-sizing: border-box; width: 260px; max-width: 50vw; padding: 7px 10px;
      border-radius: 8px; background: #2c2f35; color: #fff; caret-color: #ffb13b;
      font: 14px/1.2 system-ui, sans-serif; box-shadow: inset 0 0 0 1px #4a4e57; }
    input::placeholder { color: #8d929b; opacity: 1; }
    input:focus { box-shadow: inset 0 0 0 1px #ffb13b, 0 0 0 3px rgba(255, 177, 59, 0.22); }
    .none input { background: #3a2629;
      box-shadow: inset 0 0 0 1px #ff6b6b, 0 0 0 3px rgba(255, 107, 107, 0.2); }
    .count { min-width: 3em; text-align: center; color: #b9bdc4; font-variant-numeric: tabular-nums; }
    .count:empty { display: none; }
    .action { display: flex; gap: 8px; min-width: 0; }
    .verb { color: #ffb13b; font-weight: 600; }
    .detail { max-width: 30ch; overflow: hidden; text-overflow: ellipsis; color: #9aa0a8; }
    .panel { display: none; width: 44em; max-height: 60vh; overflow-y: auto; padding: 12px 15px;
      scrollbar-color: #4a4e57 transparent;
      font: 13px/1.45 system-ui, sans-serif; }
    .panel h1 { margin: 0; color: #fff; font-size: 14px; }
    .panel p { margin: 3px 0 11px; color: #9aa0a8; }
    .panel dl { display: grid; grid-template-columns: auto 1fr; gap: 7px 16px; margin: 0; }
    .panel dt { color: #ffb13b; font-weight: 600; white-space: nowrap; }
    .panel dd { margin: 0; color: #c9cdd4; }
    .panel .note { margin: 12px 0 0; color: #7d828b; font-size: 12px; }
    .panel .star { margin: 12px 0 0; color: #ff8a00; font-weight: 600; }
    /* The page shows through a hint, so a hint never quite hides what it sits on. The colour
       is what gives way; the letter stays as dark as it was, because it is the one thing on a
       hint that has to be read. */
    .tag { background: rgba(255, 212, 0, 0.55); color: #1f2125; border-radius: 4px;
      padding: 1px 5px; font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .panel h2 { margin: 13px 0 5px; font: 600 11px/1.3 system-ui, sans-serif;
      text-transform: uppercase; letter-spacing: 0.07em; color: #7d828b; }
    .panel h2:first-of-type { margin-top: 3px; }
    .panel h2.apart { margin-top: 13px; } /* the first heading, but under a list rather than a line */
    /* Side by side rather than one long column, so a lot of bookmarks is half the scrolling. */
    .marks { display: grid; grid-template-columns: repeat(auto-fill, minmax(15em, 1fr));
      gap: 1px 10px; }
    .markrow { display: flex; align-items: center; gap: 7px; padding: 3px 6px;
      border-radius: 6px; min-width: 0; }
    /* A letter on a colour of the site's own: no favicon can be had without asking every
       bookmarked site for one, which would tell them all what you have kept. */
    .favicon { flex: none; width: 17px; height: 17px; border-radius: 4px; color: #17181b;
      display: flex; align-items: center; justify-content: center;
      font: 700 10px/1 system-ui, sans-serif; }
    .markrow.cur { background: rgba(255, 138, 0, 0.18); box-shadow: inset 0 0 0 1px #ff8a00; }
    .marktitle { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; color: #e8e8ea; }
    /* The name matters more than the address, so the address is what gives way first. */
    .markurl { flex: 0 4 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; color: #7d828b; font-size: 11px; }
    .here { flex: none; color: #ffb13b; font-size: 11px; }
    .favicon img { display: block; width: 16px; height: 16px; border-radius: 3px; }
    .folder { display: flex; align-items: center; gap: 7px; margin-top: 7px; padding: 3px 6px;
      border-radius: 6px; color: #9aa0a8; }
    .folder.cur { background: rgba(255, 138, 0, 0.18); box-shadow: inset 0 0 0 1px #ff8a00;
      color: #e8e8ea; }
    .twist { flex: none; width: 1em; color: #ffb13b; }
    .foldername { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font: 600 11px/1.3 system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.07em; }
    .tag { position: absolute; display: none; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3); }
    .tag.dim { opacity: 0.25; }
    /* The hint being typed is the one that matters, so it gives the least way; the ones it
       cannot be are dimmed as well, and sit furthest back of all. */
    .tag.hit { background: rgba(255, 138, 0, 0.72); }
    /* The tab numbers in the list of commands, drawn like the hints they stand in for. */
    .strip .tag { position: static; display: block; flex: none; min-width: 1ch; text-align: center;
      background: rgba(255, 212, 0, 0.85); box-shadow: none; }
    .marks.strip { grid-template-columns: repeat(auto-fill, minmax(12.5em, 1fr)); }
    .pick { cursor: pointer; }
    .pick:hover { background: rgba(255, 255, 255, 0.07); }
    /* An unloaded tab. The icon is only greyed: one UOKey unloaded is faded already. */
    .gone .favicon { filter: grayscale(1); }
    .gone .marktitle { opacity: 0.45; }
    .gone .here { color: #7d828b; }
    .state { color: #7d828b; font-weight: 600; }
    .state.on { color: #ffb13b; }
    @media (max-width: 700px) { .detail { display: none; } }
  `;

  // This copy of UOKey is running inside one of the page's frames rather than in the page
  // itself. Everything on a page that sits in an <iframe> - a help widget, a cookie wall, a
  // payment field - is a document of its own that the page cannot read, so UOKey runs in every
  // frame as well. The copy in the page owns the bar and everything the user sees; the copies
  // in the frames are its eyes and hands in there.
  const inFrame = window.top !== window;

  let ui = null;
  let isOpen = false;
  let returnFocus = null;
  let index = null;
  let indexDirty = true;
  let indexTime = 0;
  let matches = [];
  let current = -1;
  let frame = 0;
  let searchTimer = 0;
  let swallowKeyUp = '';
  let shortcutText = DEFAULT_SHORTCUT;
  let shortcut = parseShortcut(DEFAULT_SHORTCUT);
  let keyToggleTime = -Infinity; // no keys of ours caught yet, however new the page is
  let shortcutAt = -Infinity; // when the shortcut was last acted on, whichever way it arrived
  let commandMatches = [];
  let windowTabs = []; // this window's tabs as last heard, numbered in the list of commands
  let fastCommands = false; // ;;fast: a command's letter runs it, with no Enter
  // ;;hints: what is typed after ; is helped along by the list of commands and the tabs with
  // their keys. Off, ;help and ;; are the only ones that put anything up.
  let showHints = true;
  let saying = false; // what a command had to say (;help) is up, until the next key
  let leaving = false; // the page is going; closing the bar now is not the user's doing
  let claimingFocus = false; // the bar is handing the keyboard to the page on purpose
  let opened = null; // { el, at }: a menu UOKey has opened, which the keyboard is left with
  let sendingKey = false; // a key UOKey is pressing for the page: not one of the bar's own
  let focusFights = 0; // times running the page has taken the keyboard straight back
  let focusFightAt = 0;
  let layered = -1; // how many dialogs and popovers the page had in the top layer, last look
  let layerDirty = true; // the page has changed since, so that count is worth taking again
  let echo = true; // whether a change here is the user's doing and should reach the other tabs
  let shortMode = false;
  let hints = [];
  let hintPending = null; // null: not in a hint; '' or more: keys typed since HINT_PREFIX
  let hintCandidates = []; // what this document has to hint, before the keys are handed out
  const frameCounts = new Map(); // frame → how many matches it has for what is in the bar
  const frameHints = new Map(); // frame → how many things it has to hint
  const frameCodes = new Map(); // hint key → the frame it belongs to
  let frameQuery = null; // what the frames were last asked to look for
  let inFrameAt = null; // { id, at }: the current match is that one of that frame's
  let frameSays = ['', '']; // and that is what the frame says Enter would do with it
  let hintTimer = 0;
  let settleTimer = 0; // waiting for the page to stop changing after a hint was used
  let settleUntil = 0; // when that wait gives up and works the hints out regardless
  let handedTo = null; // the field UOKey stepped out of the way of, while it is being typed in
  let list = null; // the LISTS entry being shown, or null for none
  let listItems = [];
  let listMatches = [];
  let listCurrent = -1;
  const listCache = new Map(); // bookmarks are asked for once a page; tabs every time
  const openFolders = new Set(); // shut folders the user has opened, kept while the page lasts
  const shutFolders = new Set(); // and the ones that start open and have been shut

  // The keyboard shortcut is handled by background.js, which tells the page to open or close
  // the bar. That way it works wherever the focus is, and can be changed in Firefox's settings.
  browser.runtime.onMessage.addListener((message) => {
    if (message === 'toggle-finder') {
      // Unless the keys were already caught below, which happens first: one press, one toggle.
      if (performance.now() - keyToggleTime > SAME_PRESS) shortcutPressed();
    } else if (message === 'bar-on') {
      if (!isOpen && document.body) quietly(() => open(deepActiveElement()));
    } else if (message === 'bar-off') {
      if (isOpen) quietly(() => close(false));
    } else if (message && typeof message.shortcut === 'string') {
      setShortcut(message.shortcut);
    } else if (message && typeof message.favicon === 'string') {
      if (!inFrame) showIcon(message.favicon);
    } else if (message && message.uokey) {
      if (inFrame) fromPage(message);
      else fromFrame(message);
    }
  });

  // ---- The page and its frames ----------------------------------------------------------------
  //
  // The copies of this script in one page's frames have no way of reaching each other, so the
  // background script passes a message between them: a frame's number, or 'all' of them. The
  // frame it came from is added on the way, so that an answer knows where to go back to.

  function relay(to, body) {
    browser.runtime.sendMessage({ relay: to, body }).catch(() => { /* nobody listening */ });
  }

  const toTop = (body) => relay(0, body);
  const toFrame = (id, body) => relay(id, body);
  const toFrames = (body) => relay('all', body);

  // In a frame: what the page has asked of it. A frame searches itself, draws over itself and
  // says what it found; it never decides anything, because the bar is not in here.
  function fromPage(message) {
    if (!isOpen) return;
    switch (message.uokey) {
      case 'find':
        ui.input.value = message.query;
        runSearch();
        toTop({ uokey: 'found', query: message.query, count: matches.length });
        break;
      case 'current': {
        current = message.at;
        const m = matches[current];
        if (m) {
          reveal(m);
          const [verb, detail] = describe(m.target);
          toTop({ uokey: 'says', verb, detail });
        }
        render();
        break;
      }
      case 'use': {
        const m = matches[message.at];
        if (m) useMatch(m, message.newTab);
        break;
      }
      case 'hints':
        hintCandidates = clickableElements();
        shortMode = true;
        toTop({ uokey: 'counted', count: hintCandidates.length });
        break;
      case 'codes':
        hints = message.codes
          .map((code, i) => ({ code, el: hintCandidates[i] }))
          .filter((h) => h.el);
        render();
        break;
      case 'typed':
        hintPending = message.prefix;
        render();
        break;
      case 'usecode': {
        const hit = hints.find((h) => h.code === message.code);
        if (hit) useHint(hit);
        break;
      }
      case 'scroll':
        // The match being scrolled around is in here. Nothing in here to scroll means the page
        // behind takes it, rather than the key doing nothing because the match is in a frame.
        if (!scrollHere(message.by)) toTop({ uokey: 'scrollpage', by: message.by });
        break;
      case 'hide':
        // The page has stepped out of the way of a field. Quietly: it is not switched off.
        quietly(() => close(false));
        break;
      case 'back':
        // Esc passed in from the bar, because this frame is where the keyboard is.
        if (document.hasFocus()) escapeThePage();
        break;
      case 'stop':
        leaveShort();
        render();
        break;
      default:
    }
  }

  // In the page: what one of its frames has answered, or passed on.
  function fromFrame(message) {
    switch (message.uokey) {
      case 'here':
        // A frame that has only just loaded, into a page where the bar is already open.
        if (!isOpen) return;
        if (frameQuery) toFrame(message.from, { uokey: 'find', query: frameQuery });
        if (shortMode) collectHints();
        break;
      case 'shortcut':
        // The shortcut keys, caught in a frame because that is where the keyboard was.
        shortcutPressed();
        break;
      case 'key':
        keyFromFrame(message);
        break;
      case 'found':
        if (!isOpen || message.query !== frameQuery) return;
        if (message.count) frameCounts.set(message.from, message.count);
        else frameCounts.delete(message.from);
        if (currentIndex() < 0) goTo(0);
        showStatus();
        render();
        break;
      case 'says':
        if (!inFrameAt || inFrameAt.id !== message.from) return;
        frameSays = [message.verb, message.detail];
        showStatus();
        break;
      case 'counted':
        if (!isOpen || !shortMode) return;
        if (message.count) frameHints.set(message.from, message.count);
        else frameHints.delete(message.from);
        break;
      case 'typing':
        // A field in one of the frames has been given the keyboard, so the bar - and what the
        // other frames are drawing - is in the way.
        if (isOpen) stepAside();
        break;
      case 'scrollpage':
        // A frame had nothing of its own to scroll, so the page moves instead.
        if (isOpen) scrollBy(0, message.by);
        break;
      case 'reopen':
        // That typing is done, so the bar comes back and takes the keyboard with it.
        if (!isOpen && document.body) open(deepActiveElement());
        break;
      case 'used':
        // Whatever the frame clicked has very likely changed the page, hints and all.
        if (isOpen && shortMode) {
          collectHints();
          settleHints();
        }
        break;
      default:
    }
  }

  // A key typed while the keyboard was inside a frame. The bar is here, so it is dealt with
  // here, exactly as though it had been typed into the bar; the frame has already kept it from
  // its own page.
  function keyFromFrame(k) {
    if (!isOpen) return;
    onKeyDown({
      key: k.key, code: k.code, shiftKey: k.shift, ctrlKey: k.ctrl, altKey: k.alt,
      metaKey: k.meta, isTrusted: true, isComposing: false, repeat: false, target: null,
      preventDefault() {}, stopImmediatePropagation() {},
    });
    // Its release happens in the frame and never reaches here, so nothing waits for it.
    swallowKeyUp = '';
  }

  // Which keys those are, so the page can watch for them too (see matchesShortcut), and so
  // ;help can name them.
  browser.runtime.sendMessage('get-shortcut')
    .then((text) => { if (typeof text === 'string') setShortcut(text); })
    .catch(() => { /* the background script didn't answer: keep the default */ });

  function tellBar(on) {
    if (!echo) return; // this tab is doing as it was told, and must not tell everyone back
    browser.runtime.sendMessage({ bar: on }).catch(() => { /* nobody listening */ });
  }

  function quietly(change) {
    echo = false;
    try {
      change();
    } finally {
      echo = true;
    }
  }

  // The bar was left on, so this page opens with it rather than waiting to be asked again.
  browser.runtime.sendMessage('bar-state')
    .then((on) => {
      if (on !== true || isOpen) return;
      // Quietly: this page is doing as the switch says, not throwing it. Saying so back would
      // set the switch on again, and a page that was still loading when you turned it off
      // would turn it back on for every tab.
      const catchUp = () => { if (!isOpen) quietly(() => open(deepActiveElement())); };
      if (document.body) catchUp();
      else addEventListener('DOMContentLoaded', catchUp, { once: true });
    })
    .catch(() => { /* no answer: the bar stays shut until it is asked for */ });

  // Only the page has a bar to type commands into, so only the page needs to know the settings.
  if (!inFrame) {
    browser.storage.local.get([FAST_STORE, HINTS_STORE])
      .then((kept) => {
        setFast(kept[FAST_STORE] === true);
        showHints = kept[HINTS_STORE] !== false;
      })
      .catch(() => { /* storage is off: the settings stay as they are while the page lasts */ });
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (FAST_STORE in changes) setFast(changes[FAST_STORE].newValue === true);
      if (HINTS_STORE in changes) showHints = changes[HINTS_STORE].newValue !== false;
    });
  }

  function setFast(on) {
    fastCommands = on;
    if (ui) ui.bar.classList.toggle('fast-on', on); // no bar yet: it is built with the F or without
  }

  function setShortcut(text) {
    shortcutText = text;
    shortcut = parseShortcut(text); // null: cleared, or keys the page can't watch for
  }

  // Added before the page's own scripts run, so while the bar is open the page never sees the
  // keys typed into it.
  addEventListener('keydown', onKeyDown, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('keypress', stopIfOurs, true);
  // Leaving the page is not the same as switching the bar off, so the switch is left alone.
  addEventListener('pagehide', () => {
    leaving = true;
    close(false);
  });

  // ---- Keyboard -------------------------------------------------------------------------------

  function onKeyDown(e) {
    if (sendingKey) return; // a key UOKey is pressing for the page itself (see keyPress)
    if (e.isTrusted && matchesShortcut(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      swallowKeyUp = e.code;
      if (!e.repeat) {
        if (inFrame) {
          toTop({ uokey: 'shortcut' }); // the switch belongs to the page, not to this frame
        } else {
          keyToggleTime = performance.now();
          shortcutPressed();
        }
      }
      return;
    }
    if (!isOpen) {
      if (handedTo) fieldKey(e); // stepped aside for a field: watch for the typing being done
      return;
    }
    // While the bar is open the keys are the bar's, wherever they were typed. They usually land
    // in the bar's own box, but a popup can be holding the keyboard, and a dialog opened with
    // showModal() shuts the rest of the page out of being focused at all - so going by where a
    // key landed would leave the bar on screen and dead.
    e.stopImmediatePropagation(); // keep the page's own keyboard shortcuts out of it
    if (!e.isTrusted || e.isComposing) return;
    if (inFrame) {
      // The bar is in the page, not in here, so the key is passed out to it rather than dealt
      // with: this frame knows nothing about what has been typed so far. What the bar would
      // type is kept from the frame as well, the way it is kept from the page itself.
      if (BARE_MODIFIERS.has(e.key)) return;
      if (!e.ctrlKey && !e.altKey && !e.metaKey) e.preventDefault();
      toTop({ uokey: 'key', key: e.key, code: e.code,
        shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
      return;
    }
    // What a command said (;help) goes at the next key. Esc only puts it away, as its first step
    // back; any other key puts it away and then does what it always does.
    if (saying && !BARE_MODIFIERS.has(e.key)) {
      hidePanel();
      if (e.key === 'Escape') {
        e.preventDefault();
        swallowKeyUp = e.code;
        return;
      }
    }
    if (scrollKey(e)) return; // before the hints, so the rest of them can be scrolled into reach
    if (shortMode && handleHintKey(e)) return;
    if (e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const direction = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
      if (inList()) stepList(direction);
      else step(direction);
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      swallowKeyUp = e.code;
      if (e.key === 'Enter') {
        // Shift or Ctrl with it opens a link in a tab behind this one instead of going there.
        const newTab = e.shiftKey || e.ctrlKey;
        if (inList()) useList(newTab);
        else activateCurrent(newTab);
      } else if (shortMode) stopShort(); // Esc puts the hints away before it closes the bar
      else if (list) stopList(); // and leaves the list before it closes the bar
      else close(true);
    } else if (!barHasFocus()) {
      typeIntoBar(e);
    }
  }

  // The bar is open but the keyboard is elsewhere, so the box is typed into by hand. What is
  // typed goes on the end, which is where the cursor would have been anyway, and Backspace
  // takes the last of it off again.
  function typeIntoBar(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      ui.input.value = ui.input.value.slice(0, -1);
    } else if (e.key.length === 1) {
      e.preventDefault();
      ui.input.value += e.key;
    } else {
      return; // a key with nothing to add to the box: F5, a modifier on its own, …
    }
    // The page may only have blurred the box rather than be holding on to it, in which case
    // this is the last key that has to be put there by hand. A key passed out of a frame is a
    // different matter: the keyboard is meant to be in there.
    if (mayClaimFocus() && !keyboardInFrame() && !pageKeepsKeys()) focusBar();
    onTyped();
  }

  function onKeyUp(e) {
    if (sendingKey) return;
    if (swallowKeyUp && e.code === swallowKeyUp) {
      // The key that clicked something or closed the bar: its release is ours too.
      swallowKeyUp = '';
      e.preventDefault();
      e.stopImmediatePropagation();
    } else {
      stopIfOurs(e);
    }
  }

  function stopIfOurs(e) {
    if (isOpen && !sendingKey) e.stopImmediatePropagation();
  }

  // UOKey has handed the keyboard to a field and is waiting for that typing to be done, which
  // is Enter - the key that submits a search, runs a command, sends a message. The keys
  // themselves are left alone: they belong to the field until then.
  function fieldKey(e) {
    if (!e.isTrusted) return;
    if (deepActiveElement() !== handedTo) {
      handedTo = null; // the keyboard went somewhere else, and was not UOKey's to wait for
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    // A one-line field has no line to break, so Enter in it is always the end of the typing.
    if (handedTo.localName === 'input' || handedTo.localName === 'select') {
      takeFieldBack();
      return;
    }
    // In a textarea or a contenteditable, Enter usually breaks a line, and breaking a line is
    // not being finished. It is the end only when the page takes the key for itself, which is
    // what a terminal, a chat box or a search box does - and what that looks like from in here
    // is a line that never got broken. Neither is knowable until the page has had the key, so
    // both are looked at once it has.
    const field = handedTo;
    const before = lineBreaks(field);
    setTimeout(() => {
      if (handedTo !== field) return;
      if (e.defaultPrevented || lineBreaks(field) <= before) takeFieldBack();
    }, 0);
  }

  // How many lines the text has been broken into. Going up is the one thing that means the
  // Enter was a line break; the box being sent, cleared or left alone all leave it where it was.
  function lineBreaks(el) {
    const text = (el.isContentEditable ? el.innerText : el.value) || '';
    return text.split('\n').length;
  }

  // Out of the way of a field, everywhere it is drawn, without being switched off. The frames
  // draw over themselves and would go on doing it with the bar gone, so they are told as well.
  function stepAside() {
    quietly(() => close(false));
    if (inFrame) toTop({ uokey: 'typing' }); // the bar, and the other frames, belong to the page
    else toFrames({ uokey: 'hide' });
  }

  function takeFieldBack() {
    handedTo = null;
    if (isOpen) return;
    if (inFrame) {
      toTop({ uokey: 'reopen' }); // the bar is the page's; this frame only says when to bring it back
      return;
    }
    if (document.body) open(deepActiveElement());
  }

  // The shortcut, however it got here. Held down, it arrives over and over; that is one press
  // too, or the bar would flicker on and off under the finger.
  function shortcutPressed() {
    const now = performance.now();
    if (now - shortcutAt < DOUBLE_PRESS) return;
    shortcutAt = now;
    toggle();
  }

  function toggle() {
    if (!isOpen) {
      open(deepActiveElement());
      return;
    }
    // One press backs out of whatever is running, the same way Esc does, and only switches the
    // bar off once there is nothing left to back out of.
    if (saying) hidePanel(); // what a command said first, as Esc does
    else if (shortMode) startShort(); // a switch: this puts the hints away and tidies the box
    else if (list) stopList();
    else close(true);
  }

  // "Ctrl+Space", "Ctrl+Shift+F" → what a keydown for it looks like. `key` is the letter it types
  // on a Latin keyboard, if it is a letter at all; `code` is where that key sits, whatever the
  // keyboard types there.
  function parseShortcut(text) {
    const parts = String(text).split('+').filter(Boolean);
    const name = parts.pop() || '';
    const has = (modifier) => parts.includes(modifier);
    const key = /^[A-Za-z0-9]$/.test(name) ? name.toLowerCase() : '';
    const code = key ? (key >= '0' && key <= '9' ? `Digit${key}` : `Key${key.toUpperCase()}`)
      : /^F([1-9]|1[0-2])$/.test(name) ? name
        : KEY_CODES[name] || '';
    if (!key && !code) return null; // a media key: Firefox handles those itself
    return {
      ctrl: has('Ctrl') || has('MacCtrl'),
      alt: has('Alt'),
      shift: has('Shift'),
      meta: has('Command'),
      key,
      code,
    };
  }

  // Firefox only fires a shortcut written with a letter when the keyboard types that letter, so a
  // shortcut changed to Ctrl+Shift+F does nothing on a Greek layout, where those keys type Φ. Catch
  // the keys here as well: by the letter while the keyboard types Latin (so Caps Lock and Shift
  // don't matter), and by the key's place on the keyboard while it types anything else. Space is
  // in the same place on every keyboard, so the default shortcut is caught by its place alone.
  function matchesShortcut(e) {
    if (!shortcut || e.ctrlKey !== shortcut.ctrl || e.altKey !== shortcut.alt
        || e.shiftKey !== shortcut.shift || e.metaKey !== shortcut.meta) return false;
    if (shortcut.key && /^[a-z0-9]$/i.test(e.key)) return e.key.toLowerCase() === shortcut.key;
    return !!shortcut.code && e.code === shortcut.code;
  }

  // ---- Bar and highlights ---------------------------------------------------------------------

  function open(before) {
    if (!document.body) return;
    handedTo = null; // the bar is back, however it got back: there is no field left to wait on
    tellBar(true);
    returnFocus = before;
    if (!ui) ui = createUI();
    if (!isOpen) {
      isOpen = true;
      document.documentElement.append(ui.host);
      ui.input.value = '';
      ui.dock.classList.remove('top');
      matches = [];
      commandMatches = [];
      current = -1;
      stopShort();
      leaveList();
      hidePanel();
      showStatus();
      render();
      ui.observer.observe(document.documentElement,
        { subtree: true, childList: true, characterData: true, attributes: true });
      addEventListener('scroll', scheduleRender, true);
      addEventListener('resize', scheduleRender);
      addEventListener('mousedown', onMouseDown, true);
      if (!inFrame) {
        addEventListener('focus', onPageFocus);
        addEventListener('focusin', onPageFocusIn, true);
      }
      // Read the page while the user starts typing, so the first key is quick.
      requestIdleCallback(() => {
        if (isOpen) ensureIndex();
      }, { timeout: 300 });
      // A frame that has only just loaded says so, in case the bar is already up and looking
      // for something: nobody has asked this frame anything yet.
      if (inFrame) toTop({ uokey: 'here' });
    }
    if (inFrame) return; // the keyboard, and the box it belongs in, are the page's
    focusBar();
    // A page can't take the keyboard from Firefox's own toolbar (e.g. the address bar). F6 moves
    // it to the page, and onPageFocus then puts it in the bar.
    ui.input.placeholder = document.hasFocus() ? PLACEHOLDER : 'Press F6 to type here';
  }

  // The page got the keyboard (back) while the bar is open: the cursor belongs in the bar.
  function onPageFocus() {
    if (!barHasFocus() && !keyboardInFrame() && !pageKeepsKeys()) focusBar();
    ui.input.placeholder = PLACEHOLDER;
  }

  // The keyboard is inside one of the page's frames. That is not a loss worth undoing: the copy
  // of UOKey in there passes every key back out to the bar, and pulling the cursor out would
  // take it off whatever the frame has just put it in.
  function keyboardInFrame() {
    const el = document.activeElement;
    return !!el && (el.localName === 'iframe' || el.localName === 'frame');
  }

  // Something in the page took the keyboard away - a cookie wall or a newsletter box opening
  // and putting the cursor in itself, or the focus trap such a thing usually comes with. The
  // bar takes it back, unless the bar was the one handing it over. A page that will not let go
  // is left holding it rather than being fought frame after frame; the keys still reach the bar
  // either way, wherever they land (see onKeyDown), so the bar stays usable regardless.
  function onPageFocusIn(e) {
    if (!isOpen || claimingFocus || e.target === ui.host) return;
    if (keyboardInFrame()) return; // a frame of the page's own: it hands the keys back out
    layerDirty = true; // whatever took the keyboard has probably just gone up on top, too
    scheduleRender();
    const now = performance.now();
    focusFights = now - focusFightAt < FOCUS_FIGHT_WINDOW ? focusFights + 1 : 1;
    focusFightAt = now;
    if (mayClaimFocus() && !pageKeepsKeys()) focusBar();
  }

  // Whether pulling the keyboard back is worth another go: a page answering every pull with one
  // of its own is left to it, until it has been quiet long enough to be worth trying again.
  function mayClaimFocus() {
    return focusFights <= FOCUS_FIGHT_LIMIT
      || performance.now() - focusFightAt > FOCUS_FIGHT_WINDOW;
  }

  // The bar's own box holds the keyboard. The shadow root is closed, so as far as the page and
  // document.activeElement are concerned the keyboard is on the host element.
  function barHasFocus() {
    return document.activeElement === ui.host;
  }

  function focusBar() {
    ui.input.focus({ preventScroll: true });
  }

  function close(restoreFocus) {
    if (!isOpen) return;
    if (!leaving) tellBar(false);
    isOpen = false;
    ui.observer.disconnect();
    removeEventListener('scroll', scheduleRender, true);
    removeEventListener('resize', scheduleRender);
    removeEventListener('mousedown', onMouseDown, true);
    removeEventListener('focus', onPageFocus);
    removeEventListener('focusin', onPageFocusIn, true);
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(searchTimer);
    searchTimer = 0;
    ui.host.remove(); // which takes it out of the top layer as well, keyboard and all
    clearTimeout(hintTimer);
    hintTimer = 0;
    clearTimeout(settleTimer);
    settleTimer = 0;
    hintCandidates = [];
    frameCounts.clear();
    frameHints.clear();
    frameCodes.clear();
    frameQuery = null;
    inFrameAt = null;
    layered = -1;
    layerDirty = true;
    focusFights = 0;
    matches = [];
    index = null;
    opened = null;
    shortMode = false;
    hints = [];
    hintPending = null;
    leaveList();
    const previous = returnFocus;
    returnFocus = null;
    if (restoreFocus && previous && previous !== document.body && previous.isConnected) {
      previous.focus({ preventScroll: true });
    }
  }

  // A real mouse press outside the bar means the page is wanted, so the bar gets out of the way.
  // The clicks UOKey makes itself are not trusted, and must not be taken for someone leaving.
  function onMouseDown(e) {
    if (e.isTrusted && e.target !== ui.host) close(false);
  }

  function createUI() {
    // The page's CSS can't reach inside a closed shadow root, and the inline !important
    // styles keep it from hiding or moving the host element.
    const host = document.createElement('uokey-finder');
    // display is spelled out because the bar is shown as a popover (see stayOnTop), and a
    // popover is display: none until it is: the bar is on screen whether that worked or not.
    host.style.cssText = 'all: initial !important; display: block !important;'
      + ' position: fixed !important; inset: 0 !important;'
      + ' z-index: 2147483647 !important; pointer-events: none !important;';
    const root = host.attachShadow({ mode: 'closed' });

    const layer = make('div', 'layer');
    const outline = make('div', 'outline');
    layer.append(outline);
    const input = make('input');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = PLACEHOLDER;
    input.setAttribute('aria-label', 'Text of the link, button or field to click');
    const count = make('span', 'count');
    const verb = make('span', 'verb');
    const detail = make('span', 'detail');
    const action = make('span', 'action');
    action.append(verb, detail);
    const extras = make('div', 'extras');
    extras.append(count, action);
    const fast = make('div', 'fast', 'F');
    fast.title = `${SETTINGS_PREFIX}fast is on: a command's letter runs it, with no Enter`;
    const bar = make('div', 'bar');
    bar.append(input, fast);
    bar.classList.toggle('fast-on', fastCommands);
    // The bar holds nothing but the box to type in (and the F for ;;fast, inside its far end), and
    // the row holds nothing but the bar, so what is centred on the screen is the typing box
    // itself. The count and what Enter will do hang off its side without moving it.
    const row = make('div', 'row');
    row.append(bar, extras);
    const panel = make('div', 'panel');
    const dock = make('div', 'dock');
    dock.append(panel, row); // on top the dock turns over, so the panel is always the far side
    root.append(make('style', '', CSS), layer);
    // The bar itself belongs to the page. A frame builds it all the same and leaves it out of
    // the page, so that the box still holds what is being looked for and nothing has to ask,
    // at every turn, whether there is a bar to write to.
    if (!inFrame) root.append(dock);

    input.addEventListener('input', onTyped);
    // Clicking the bar or the panel must not take focus away from the input.
    dock.addEventListener('mousedown', (e) => {
      if (e.target !== input) e.preventDefault();
    });
    const observer = new MutationObserver((records) => {
      layerDirty = true;
      // The page is still moving after a hint was used: give it longer to finish before the
      // hints are worked out, so what it puts up gets one.
      if (settleTimer && performance.now() < settleUntil) waitForSettle();
      if (!indexDirty) {
        indexDirty = records.some((r) => r.type !== 'attributes' || INDEXED_ATTRIBUTES.has(r.attributeName));
      }
      scheduleRender();
    });
    return {
      host, layer, outline, dock, bar, panel, input, count, extras, action, verb, detail,
      observer, boxes: [], tags: [],
    };
  }

  // Something new in the box, typed into it or put there by typeIntoBar.
  function onTyped() {
    clearTimeout(searchTimer);
    searchTimer = 0;
    const text = fold(ui.input.value);
    // One letter matches half the page, which is slow; wait a moment for the next one.
    // Commands search nothing, so they answer straight away.
    if (text.length === 1 && !text.startsWith(COMMAND_PREFIX)) {
      searchTimer = setTimeout(runSearch, ONE_LETTER_DELAY);
    } else {
      runSearch();
    }
  }

  function showStatus() {
    if (inFrame) return; // there is no bar in here to say it in
    if (shortMode && !ui.input.value.trim().startsWith(COMMAND_PREFIX)) {
      ui.bar.classList.remove('none');
      ui.count.textContent = '';
      ui.action.style.display = '';
      const shown = hints.length + frameCodes.size;
      ui.verb.textContent = hintPending || 'hints';
      ui.detail.textContent = hintPending ? 'keep going'
        : (shown
          ? `${shown} on this page - ${COMMAND_PREFIX}s or Esc to stop`
          : (hintTimer ? 'looking…' : 'nothing on this page can be clicked'));
      ui.extras.classList.add('on');
      return;
    }
    if (inList()) {
      const entry = listMatches[listCurrent];
      const things = listMatches.filter((e) => e.kind === 'item');
      const at = entry && entry.kind === 'item' ? things.indexOf(entry) + 1 : 0;
      ui.bar.classList.toggle('none', !entry);
      ui.count.textContent = `${at}/${things.length}`;
      ui.action.style.display = entry ? '' : 'none';
      if (entry && entry.kind === 'head') {
        ui.verb.textContent = entry.open ? '↵ close' : '↵ open';
        ui.detail.textContent = `${entry.count} in ${entry.name}`;
      } else if (entry) {
        ui.verb.textContent = list.verb;
        ui.detail.textContent = addressFor(entry.item);
      }
      ui.extras.classList.add('on');
      return;
    }
    const text = ui.input.value.trim();
    if (text.startsWith(COMMAND_PREFIX)) {
      const { prefix, list, name } = typedCommand(text);
      const command = commandMatches[0];
      // Enter only has something left to do while the name is still half-typed.
      const finishes = command && !commandNamed(name, list);
      const toUnload = list === COMMANDS && name === UNLOAD; // waiting for the key of the tab
      ui.bar.classList.toggle('none', !command && !toUnload);
      ui.count.textContent = '';
      ui.action.style.display = finishes || toUnload ? '' : 'none';
      if (finishes) {
        ui.verb.textContent = `↵ ${prefix}${command.name}`;
        ui.detail.textContent = command.summary;
      } else if (toUnload) {
        ui.verb.textContent = '0 … 9, a … z';
        ui.detail.textContent = 'the tab to unload, 0 for this one';
      }
      ui.extras.classList.toggle('on', !!finishes || toUnload);
      return;
    }
    const m = matches[current];
    const total = totalMatches();
    const at = currentIndex();
    ui.bar.classList.toggle('none', text !== '' && !total);
    ui.count.textContent = text ? `${at >= 0 ? at + 1 : 0}/${total}` : '';
    ui.action.style.display = at >= 0 ? '' : 'none';
    if (m) {
      const [verb, detail] = describe(m.target);
      ui.verb.textContent = `↵ ${verb}`;
      ui.detail.textContent = detail;
    } else if (inFrameAt) {
      // The match is in a frame, which has said what it is; until it does, Enter clicks.
      ui.verb.textContent = `↵ ${frameSays[0] || 'click'}`;
      ui.detail.textContent = frameSays[1];
    }
    // Nothing typed yet: the bar is only the box to type in.
    ui.extras.classList.toggle('on', text !== '');
  }

  // What Enter will do, for the bar.
  function describe(el) {
    const control = el.localName === 'label' ? el.control : null;
    const target = control || el;
    if (isTypeable(target)) return ['type here', ''];
    if (target.localName === 'select') return ['choose', ''];
    const kind = target.localName === 'input' ? target.type : target.getAttribute('role');
    if (kind === 'checkbox' || kind === 'radio' || kind === 'switch') return ['toggle', ''];
    const link = el.closest('a[href]');
    if (link) return ['open link', /^https?:/.test(link.href) ? link.href.replace(/^https?:\/\/(www\.)?/, '') : ''];
    if (opensSomething(target)) {
      const showing = isShowing(target);
      if (showing === true) return ['close', ''];
      const menu = (target.getAttribute('aria-haspopup') || '').toLowerCase();
      return [POPUP_KINDS.has(menu) ? 'open' : 'expand', ''];
    }
    return ['click', ''];
  }

  function scheduleRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    if (!isOpen) return;
    stayOnTop();
    const width = innerWidth;
    const height = innerHeight;
    const cur = matches[current];
    let used = 0;
    for (const m of matches) {
      for (const r of rectsOf(m)) {
        if (r.bottom < 0 || r.top > height || r.right < 0 || r.left > width) continue;
        place(ui.boxes[used] || addBox(), r, m === cur ? 'hl cur' : 'hl', 0);
        used++;
      }
    }
    for (let i = used; i < ui.boxes.length; i++) ui.boxes[i].style.display = 'none';

    const target = cur && cur.target.getBoundingClientRect();
    if (target && target.width && target.height) place(ui.outline, target, 'outline', 4);
    else ui.outline.style.display = 'none';

    // Move the bar to the top when it would cover the current match.
    const first = cur && rectsOf(cur)[0];
    if (first) {
      const bar = ui.bar.getBoundingClientRect();
      const barTop = height - 18 - bar.height - 8;
      ui.dock.classList.toggle('top',
        first.bottom > barTop && first.left < bar.right + 8 && first.right > bar.left - 8);
    }

    if (shortMode) renderTags();
    else hideTags();
  }

  // The highest z-index there is still loses to anything the page adds after us and asks for
  // the same, so the bar is put back at the end whenever something else takes that place.
  //
  // A dialog opened with showModal(), and anything shown as a popover, is not in the page's
  // stacking order at all: Firefox puts it in the top layer, above every z-index there is, so
  // no amount of being last wins against it. The bar is shown as a popover itself for that, and
  // the top layer goes by the same rule - last one shown is on top - so it is shown again
  // whenever the page has put something new up there.
  //
  // Either move takes the keyboard with it, so it is handed back afterwards.
  function stayOnTop() {
    const top = document.documentElement;
    if (!top) return;
    const displaced = ui.host !== top.lastElementChild;
    // Scrolling moves nothing about, so the top layer is only counted again once the page has
    // actually changed.
    if (!displaced && !layerDirty) return;
    layerDirty = false;
    const count = topLayerCount();
    if (!displaced && count === layered) return;
    const had = barHasFocus();
    claimingFocus = true; // any blur the move causes is the bar's own doing, not the page's
    try {
      // Taking it out of the page takes it out of the top layer too, so it goes back up after.
      if (displaced) top.append(ui.host);
      showOnTopLayer();
    } finally {
      claimingFocus = false;
    }
    layered = topLayerCount();
    if (had && !barHasFocus()) focusBar();
  }

  // How many dialogs and popovers are up, the bar's own included: not which is on top, which
  // nothing can ask, but enough to notice that the page has put something new there.
  function topLayerCount() {
    try {
      return document.querySelectorAll(':modal, :popover-open').length;
    } catch {
      return 0; // an older Firefox that doesn't know the selectors has no top layer to lose to
    }
  }

  function showOnTopLayer() {
    if (typeof ui.host.showPopover !== 'function') return;
    try {
      if (ui.host.popover !== 'manual') ui.host.popover = 'manual';
      hideFromTopLayer();
      ui.host.showPopover();
    } catch {
      /* popovers aren't allowed here: the bar still sits at the end of the page */
    }
  }

  function hideFromTopLayer() {
    try {
      if (ui.host.matches(':popover-open')) ui.host.hidePopover();
    } catch {
      /* it isn't up there */
    }
  }

  function addBox() {
    const box = document.createElement('div');
    ui.layer.append(box);
    ui.boxes.push(box);
    return box;
  }

  function place(el, r, className, pad) {
    el.className = className;
    const s = el.style;
    s.display = 'block';
    s.left = `${r.left - pad}px`;
    s.top = `${r.top - pad}px`;
    s.width = `${r.width + 2 * pad}px`;
    s.height = `${r.height + 2 * pad}px`;
  }

  function step(direction) {
    if (searchTimer) runSearch(); // a one-letter search may still be waiting
    if (!totalMatches()) return;
    const at = currentIndex();
    goTo(at < 0 ? (direction > 0 ? 0 : -1) : at + direction);
    showStatus();
    render();
  }

  // ---- Matches in the page's frames ------------------------------------------------------------
  //
  // A frame keeps its own matches and draws its own highlights, so all the page holds of them is
  // how many each frame has. The page's own come first, then each frame's in the order the
  // frames come, which is the order they are read in.

  function frameOrder() {
    return [...frameCounts.keys()].sort((a, b) => a - b);
  }

  function totalMatches() {
    let n = matches.length;
    for (const count of frameCounts.values()) n += count;
    return n;
  }

  // Where the current match comes in the page as a whole, counting the frames in it.
  function currentIndex() {
    if (current >= 0) return current;
    if (!inFrameAt) return -1;
    let n = matches.length;
    for (const id of frameOrder()) {
      if (id === inFrameAt.id) return n + inFrameAt.at;
      n += frameCounts.get(id);
    }
    return -1;
  }

  // The other way about: make the nth match of the page as a whole the current one.
  function goTo(n) {
    const total = totalMatches();
    if (!total) return;
    n = ((n % total) + total) % total;
    if (n < matches.length) {
      leaveFrameMatch();
      current = n;
      reveal(matches[current]);
      return;
    }
    n -= matches.length;
    for (const id of frameOrder()) {
      const count = frameCounts.get(id);
      if (n < count) {
        leaveFrameMatch();
        current = -1;
        inFrameAt = { id, at: n };
        // The frame shows it and scrolls to it, and says back what Enter would do with it.
        toFrame(id, { uokey: 'current', at: n });
        return;
      }
      n -= count;
    }
  }

  // The current match was in a frame and is not any more, so that frame stops showing it as the
  // one Enter would click.
  function leaveFrameMatch() {
    if (!inFrameAt) return;
    toFrame(inFrameAt.id, { uokey: 'current', at: -1 });
    inFrameAt = null;
    frameSays = ['', ''];
  }

  // The frames look for the same thing, and answer in their own time. Asking again for what
  // they are already looking for would only make them do it twice.
  function askFrames(text) {
    if (inFrame || text === frameQuery) return;
    frameQuery = text;
    leaveFrameMatch();
    frameCounts.clear();
    toFrames({ uokey: 'find', query: text });
  }

  // < and > move the page a nudge, PageUp and PageDown a screen. They are read off e.key, so a
  // keyboard with a < > key of its own works as well as one that wants Shift for them.
  function scrollKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    const screen = innerHeight * SCREENFUL;
    const by = e.key === '<' ? -NUDGE
      : e.key === '>' ? NUDGE
        : e.key === 'PageUp' ? -screen
          : e.key === 'PageDown' ? screen
            : 0;
    if (!by) return false;
    e.preventDefault();
    scrollAt(by);
    return true;
  }

  // Whatever the match you are on sits in, so a long menu, a chat panel or a list of results
  // moves on its own rather than the page behind it. With nothing to go on - nothing found yet,
  // or nothing that scrolls around it - the page itself moves, which is what you meant anyway.
  function scrollAt(by) {
    if (inFrameAt) {
      toFrame(inFrameAt.id, { uokey: 'scroll', by }); // the match is in there; so is what holds it
      return;
    }
    scrollHere(by);
  }

  // True if something here took it. A frame that has nothing to scroll says so, rather than
  // swallowing the key and leaving the page still.
  function scrollHere(by) {
    const m = matches[current];
    const el = m && (m.els[0] || (m.ranges[0] && flatParent(m.ranges[0].startContainer)));
    const box = el && scrollerOf(el, by);
    if (box) {
      box.scrollTop += by;
      return true;
    }
    if (!windowScrolls(by)) return false;
    scrollBy(0, by);
    return true;
  }

  // The nearest thing above an element that can scroll, and has somewhere left to go that way.
  // One that has reached its end is stepped over, so the page takes the key instead of the last
  // press of it doing nothing at all.
  function scrollerOf(el, by) {
    for (let node = el; node; node = flatParent(node)) {
      if (node === document.documentElement || node === document.body) break;
      if (!/auto|scroll/.test(getComputedStyle(node).overflowY)) continue;
      if (hasRoom(node, by)) return node;
    }
    return null;
  }

  function windowScrolls(by) {
    const el = document.scrollingElement || document.documentElement;
    return !!el && hasRoom(el, by);
  }

  function hasRoom(el, by) {
    return by < 0 ? el.scrollTop > 0
      : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  }

  // Scroll a match into view if it isn't fully visible.
  function reveal(m) {
    const r = rectsOf(m)[0];
    if (!r || (r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth)) return;
    const el = m.els[0] || flatParent(m.ranges[0].startContainer);
    if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  // ---- Clicking -------------------------------------------------------------------------------

  function activateCurrent(newTab) {
    if (ui.input.value.trim().startsWith(COMMAND_PREFIX)) {
      runCommand();
      return;
    }
    if (inFrameAt) {
      // The match is inside a frame, and only the frame can click it.
      toFrame(inFrameAt.id, { uokey: 'use', at: inFrameAt.at, newTab });
      return;
    }
    if (searchTimer || (indexDirty && ui.input.value.trim())) runSearch(); // results are stale
    const m = matches[current];
    if (m) useMatch(m, newTab);
  }

  function useMatch(m, newTab) {
    // Only a link goes anywhere on its own, so only a link can be opened in a tab behind this
    // one; a button or a field is clicked where it stands, whatever was held down.
    const href = newTab ? linkOf(m) : '';
    if (href) {
      openNewTab(href);
      return;
    }
    useElement(m, rectsOf(m)[0], true);
  }

  // Clicking something no longer puts the bar away: it stays until Ctrl+Space or Esc. A field
  // is the one exception, because the cursor has to be in it for you to type. Afterwards the
  // bar takes the keyboard back, or the keys that work it would go to whatever was just clicked.
  function useElement(m, rect, clear) {
    const target = realTarget(m.target);
    if (isTypeable(target) || target.localName === 'select') {
      // Quietly. Stepping out of the way of a field is not switching UOKey off, and saying it
      // was would throw the switch that every other tab and every page opened next goes by: one
      // hint on a search box would put the bar away everywhere. A page can hide a field behind
      // anything - learngitbranching.js.org has its terminal behind a home icon, by making the
      // icon a <label> for it - so this is reached far more often than a field that looks like one.
      stepAside();
      activate(m, rect);
      handedTo = target; // until that typing is done: see fieldKey
      return;
    }
    opened = null; // this is a new thing to use: whatever was open before is not its doing
    const opening = keepsKeys(target); // a menu about to be opened, rather than shut again
    activate(m, rect);
    if (!isOpen) return; // it was a link, and the page is on its way somewhere else
    // A menu that has just been opened keeps the keyboard, because most shut the moment it
    // leaves them. The bar reads the keys wherever they land, so it loses nothing by letting it.
    if (opening) opened = { el: target, at: performance.now() };
    if (!pageKeepsKeys()) focusBar();
    indexDirty = true; // whatever was clicked has probably changed the page
    if (clear) {
      ui.input.value = ''; // done with: the box is ready for the next thing rather than the last
      runSearch();
    }
  }

  function realTarget(el) {
    const control = el.localName === 'label' ? el.control : null;
    return control || el;
  }

  function linkOf(m) {
    const link = m.target.closest && m.target.closest('a[href]');
    return link && /^https?:/i.test(link.href) ? link.href : '';
  }

  // Clicking something means putting the keyboard on it first, the way a mouse would, and
  // that must not be read as the page stealing it (see onPageFocusIn).
  function activate(m, rect) {
    claimingFocus = true;
    try {
      click(m, rect);
    } finally {
      claimingFocus = false;
    }
  }

  function click(m, rect) {
    let el = m.target;
    const control = el.localName === 'label' ? el.control : null;
    if (control && (isTypeable(control) || control.localName === 'select')) el = control;

    if (isTypeable(el)) {
      el.focus();
      if (el.isContentEditable) {
        if (el === m.target && m.ranges.length) {
          getSelection().collapse(m.ranges[0].startContainer, m.ranges[0].startOffset);
        }
      } else {
        try {
          el.setSelectionRange(el.value.length, el.value.length); // cursor at the end
        } catch { /* email/number fields don't support it */ }
      }
      return;
    }
    if (el.localName === 'select') {
      el.focus();
      try {
        el.showPicker();
      } catch { /* not supported here */ }
      return;
    }

    // Mimic a real mouse click on the matched text, so that handlers on it or on any of its
    // parents run, not just the link/button's own.
    const clickEl = m.clickEl.isConnected ? m.clickEl : el;
    const x = rect ? rect.left + rect.width / 2 : 0;
    const y = rect ? rect.top + rect.height / 2 : 0;
    // A mouse is over a thing before it clicks it, and a menu that opens under the pointer -
    // a submenu of a menu most of all - is waiting for that and for nothing else.
    hover(clickEl, el, x, y);
    el.focus({ preventScroll: true });
    if (opensSomething(el) && isShowing(el) === false) {
      openUp(el, clickEl, x, y); // the pointer may be enough; clicking then would shut it again
      return;
    }
    press(clickEl, x, y);
  }

  function press(el, x, y) {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) fire(el, type, x, y);
    if (typeof el.click === 'function') el.click();
    else fire(el, 'click', x, y);
  }

  // The pointer arriving: everything the page is told before a click, and all a menu that opens
  // on hover is ever told. Nothing is told the pointer left again - a submenu takes that for the
  // pointer wandering off and shuts itself - and the real mouse clears the hover when it moves.
  function hover(el, owner, x, y) {
    for (const type of ['pointerover', 'mouseover']) fire(el, type, x, y);
    // enter is the one event that never bubbles: a pointer arriving sets it off on every thing
    // it has come into, the outermost first, and not only on the innermost.
    for (const node of chain(el, owner)) {
      for (const type of ['pointerenter', 'mouseenter']) fire(node, type, x, y);
    }
    for (const type of ['pointermove', 'mousemove']) fire(el, type, x, y);
  }

  // From the link or button the pointer has come into, in, to the very text it is over.
  function chain(from, to) {
    const list = [];
    for (let el = from; el; el = el.parentElement) {
      list.unshift(el);
      if (el === to) break;
    }
    return list;
  }

  function fire(el, type, x, y) {
    const init = {
      // enter and leave are the two that are only ever about the thing itself, never its parents.
      bubbles: !type.endsWith('enter'), cancelable: true, composed: true, view: window, detail: 1,
      clientX: x, clientY: y, button: 0, buttons: type.endsWith('down') ? 1 : 0,
    };
    el.dispatchEvent(type.startsWith('pointer')
      ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true })
      : new MouseEvent(type, init));
  }

  function isTypeable(el) {
    if (el.localName === 'input') return TEXT_INPUT_TYPES.has(el.type);
    if (el.localName === 'textarea' || el.isContentEditable) return true;
    const role = el.getAttribute('role');
    return role === 'textbox' || role === 'searchbox';
  }

  function isDisabled(el) {
    return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
  }

  // ---- Things that open rather than do ---------------------------------------------------------

  // A menu, a submenu, a dropdown, a disclosure. The page says so itself: aria-haspopup on what
  // a menu hangs off, aria-expanded on what opens and shuts, a <summary> on its <details>.
  function opensSomething(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.localName === 'summary') return true;
    if (el.hasAttribute('aria-expanded')) return true;
    return POPUP_KINDS.has((el.getAttribute('aria-haspopup') || '').toLowerCase());
  }

  // Whether what it opens is up: true, false, or null when the page keeps that to itself and
  // only it knows. data-state is where most of the widget libraries put it.
  function isShowing(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.localName === 'summary') {
      const details = el.closest('details');
      return details ? !!details.open : null;
    }
    const expanded = el.getAttribute('aria-expanded');
    if (expanded === 'true' || expanded === 'false') return expanded === 'true';
    const state = (el.getAttribute('data-state') || '').toLowerCase();
    if (OPEN_STATES.has(state)) return true;
    if (CLOSED_STATES.has(state)) return false;
    return null;
  }

  // Something shut that opens when it is used. The pointer is on it already; if that was enough
  // there is nothing left to do, and clicking what is now open would only shut it again. So each
  // step waits to see what the last one did, and stops as soon as the thing is up: the pointer,
  // then the click, then Enter, then the key that kind of menu opens sideways or downwards with.
  function openUp(el, clickEl, x, y) {
    setTimeout(() => {
      if (!el.isConnected || isShowing(el) !== false) return;
      claimingFocus = true; // the click may move the keyboard: still the bar's doing, not a theft
      try {
        press(clickEl, x, y);
      } finally {
        claimingFocus = false;
      }
      openWithKey(el, 'Enter', submenuKey(el));
    }, HOVER_OPEN);
  }

  function openWithKey(el, key, next) {
    setTimeout(() => {
      if (!el.isConnected || isShowing(el) !== false) return;
      keyPress(el, key);
      if (next) openWithKey(el, next, '');
    }, KEY_OPEN);
  }

  // A submenu opens sideways, whichever way the page is written; anything else opens downwards.
  function submenuKey(el) {
    if (!/^menuitem/.test(el.getAttribute('role') || '')) return 'ArrowDown';
    return getComputedStyle(el).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  }

  // Which shut things are worth leaving the keyboard with once they open: a menu, a submenu or
  // a dropdown, which shut again as soon as the keyboard leaves them. A panel or a disclosure
  // stays open whatever has the keyboard, and the cursor is better off back in the box.
  function keepsKeys(el) {
    if (!opensSomething(el) || isShowing(el) !== false) return false;
    if (POPUP_KINDS.has((el.getAttribute('aria-haspopup') || '').toLowerCase())) return true;
    return /^(menuitem|combobox)/.test(el.getAttribute('role') || '');
  }

  // The keyboard is left with the page while a menu UOKey opened is up: pulling it back into the
  // bar would shut the menu. Until the page says the menu has gone - or it takes too long to say
  // anything at all - the keys reach the bar where they land (see onKeyDown) and the bar waits.
  function pageKeepsKeys() {
    if (!opened) return false;
    if (opened.el.isConnected
      && (isShowing(opened.el) !== false || performance.now() - opened.at < OPEN_GRACE)) {
      return true;
    }
    opened = null;
    return false;
  }

  // A key pressed for the page. UOKey's own listener runs before the page's and keeps every key
  // to the bar while it is open (see onKeyDown), so the ones it sends on purpose say so.
  function keyPress(el, key) {
    if (!el || !el.isConnected) return;
    sendingKey = true;
    try {
      for (const type of ['keydown', 'keyup']) {
        el.dispatchEvent(new KeyboardEvent(type, {
          key, code: key, keyCode: KEY_NUMBERS[key] || 0, charCode: 0,
          bubbles: true, cancelable: true, composed: true, view: window,
        }));
      }
    } finally {
      sendingKey = false;
    }
  }

  // ---- Commands -------------------------------------------------------------------------------

  // The bar holds a command instead of text to find: show what it does, or what could be meant.
  function showCommands(typed) {
    matches = [];
    current = -1;
    const { list, name } = typedCommand(typed);
    const settings = list === SETTINGS;
    // ;1 to ;9: a number is a whole command already, so it runs as soon as it is typed.
    if (!settings && /^[1-9]$/.test(name)) {
      tabCommand({ tabAt: Number(name) }, `There is no tab ${name} in this window`);
      return;
    }
    // ;d0 to ;dz the same, once the tab's key is there.
    const unload = !settings && new RegExp(`^${UNLOAD}([0${TAB_KEYS}])$`).exec(name);
    if (unload) {
      unloadTab(TAB_KEYS.indexOf(unload[1]) + 1); // 0 is not among them, and comes out as 0
      return;
    }
    // A command's letter comes first, so Enter on ;s is ;shortcut whatever else starts with s.
    commandMatches = [
      ...list.filter((c) => c.letter === name),
      ...list.filter((c) => c.letter !== name && c.name.startsWith(name)),
    ];
    const exact = commandNamed(name, list);
    if (exact && exact.run) {
      exact.run(); // a command that does something rather than saying something
      return;
    }
    if (exact) {
      // Done with, like every command once it has run: the box is empty and ready for the next
      // thing. What the command says stays up until a key is pressed.
      ui.input.value = '';
      commandMatches = [];
      showPanel(exact.fill);
      saying = true;
    } else if (settings) {
      showPanel((panel) => fillSettings(panel, commandMatches.length ? '' : name));
    } else if (showHints) {
      showPanel((panel) => fillCommandList(panel, name));
    } else {
      hidePanel(); // ;;hints is off: nothing comes up while a command is being typed
    }
    showStatus();
    render();
  }

  // What the box holds as a command: the prefix it was typed with, the commands or the settings
  // that go with it, and the name as far as it has been typed.
  function typedCommand(text) {
    const prefix = text.startsWith(SETTINGS_PREFIX) ? SETTINGS_PREFIX : COMMAND_PREFIX;
    return {
      prefix,
      list: prefix === SETTINGS_PREFIX ? SETTINGS : COMMANDS,
      name: text.slice(prefix.length).trim().toLowerCase(),
    };
  }

  // The command the bar holds in full: its name, or with ;;fast on its letter alone.
  function commandNamed(name, list) {
    return list.find((c) => c.name === name || (fastCommands && c.letter === name));
  }

  // ;1 to ;9, ;last and ;d0 to ;dz. Switching and unloading tabs is the background script's to
  // do, and the bar comes up in whichever tab is in front, being a switch for the whole browser.
  // Only a tab that isn't there, or has nothing loaded to unload, leaves anything to say here.
  function tabCommand(ask, none, idle = '') {
    ui.input.value = '';
    runSearch();
    browser.runtime.sendMessage(ask)
      .then((answer) => {
        const say = answer === false ? none : (answer === 'idle' ? idle : '');
        if (!say || !isOpen) return;
        showPanel((panel) => panel.append(make('h1', '', say)));
        saying = true;
      })
      .catch(() => { /* the background script didn't answer: there is nothing to say */ });
  }

  // Unloading frees the memory a tab holds and leaves it on the strip, greyed, to load again
  // when it is next gone to. Unloading the tab in front goes to the next one along first.
  function unloadTab(place) {
    const key = place ? TAB_KEYS[place - 1] : '0';
    tabCommand({ unload: place }, `There is no tab ${key} in this window`,
      `Tab ${key} has nothing loaded to unload`);
  }

  // background.js fades a tab's icon to grey before unloading it, a frame at a time, and the
  // page is where a tab's icon comes from. A <link> of its own, so the page's are left alone.
  function showIcon(href) {
    let link = document.getElementById(ICON_ID);
    if (!link) {
      link = document.createElement('link');
      link.id = ICON_ID;
      link.rel = 'icon';
      (document.head || document.documentElement).append(link);
    }
    link.href = href;
  }

  // ;up: the top of the page. The page itself if it has been scrolled, or else whatever has
  // been scrolled in the middle of the screen, which is where the page is on a site that keeps
  // everything in a panel of its own and never scrolls the page at all.
  function goUp() {
    ui.input.value = '';
    runSearch(); // the box is ready for the next thing
    const page = document.scrollingElement || document.documentElement;
    if (page && page.scrollTop > 0) {
      scrollTo(0, 0);
      return;
    }
    const middle = elementAtPoint(innerWidth / 2, innerHeight / 2);
    const box = middle && scrollerOf(middle, -1);
    if (box) box.scrollTop = 0;
  }

  // ;github brings the page up in a tab of its own, beside this one, and the bar comes along.
  function openGitHub() {
    ui.input.value = '';
    runSearch(); // the box is ready for the next thing
    browser.runtime.sendMessage({ newTab: GITHUB_PAGE, front: true })
      .catch(() => window.open(GITHUB_PAGE, '_blank'));
  }

  // ;;fast is a switch, and the F in the box says which way it is.
  function toggleFast() {
    setFast(!fastCommands);
    browser.storage.local.set({ [FAST_STORE]: fastCommands })
      .catch(() => { /* storage is off: the switch lasts while this page does */ });
    flipped();
  }

  function toggleHints() {
    showHints = !showHints;
    browser.storage.local.set({ [HINTS_STORE]: showHints })
      .catch(() => { /* storage is off: the switch lasts while this page does */ });
    flipped();
  }

  // A switch has been flipped. The box is ready for the next thing, as after any command, and
  // the settings stay up until the next key so that the way it is now can be seen.
  function flipped() {
    ui.input.value = '';
    runSearch();
    showPanel((panel) => fillSettings(panel, ''));
    saying = true;
  }

  // ;;settings: Firefox's Preferences page for UOKey. Only the background script may open it.
  function openSettings() {
    ui.input.value = '';
    runSearch();
    browser.runtime.sendMessage('open-settings').catch(() => { /* nobody listening */ });
  }

  // ;reload: the hints worked out again for whatever the page has put up since, as Space does,
  // and the tabs' keys shown afresh for however the window stands now.
  function reload() {
    if (list) leaveList(); // the tabs take the panel, so a list would only be left behind it
    ui.input.value = '';
    runSearch();
    if (shortMode) {
      cancelHint();
      collectHints();
      showStatus();
      render();
    }
    if (!showHints) return; // the tabs are a hint like any other, and hints are off
    showPanel((panel) => panel.append(make('h1', '', 'Tabs in this window'), tabStrip('')));
    saying = true;
  }

  // Enter on a command: finish typing its name, which shows what it has to say.
  function runCommand() {
    const command = commandMatches[0];
    if (!command) return;
    ui.input.value = typedCommand(ui.input.value.trim()).prefix + command.name;
    runSearch();
  }

  function showPanel(fill) {
    saying = false;
    ui.panel.textContent = '';
    fill(ui.panel);
    ui.panel.style.display = 'block';
    ui.panel.scrollTop = 0;
  }

  function hidePanel() {
    saying = false;
    if (!ui.panel.style.display) return;
    ui.panel.style.display = '';
    ui.panel.textContent = '';
  }

  function fillCommandList(panel, name) {
    if (name === UNLOAD) {
      panel.append(make('h1', '', 'Unload which tab?'),
        make('p', '', 'Type its key, or 0 for the one you are on.'));
      panel.append(tabStrip(UNLOAD));
      return;
    }
    panel.append(make('h1', '', commandMatches.length
      ? 'Commands'
      : `There is no ${COMMAND_PREFIX}${name} command`));
    panel.append(make('p', '', fastSays()));
    panel.append(commandRows());
    panel.append(make('h2', 'apart', 'Tabs in this window'), tabStrip(''));
  }

  function fillSettings(panel, missing) {
    panel.append(
      make('h1', '', missing ? `There is no ${SETTINGS_PREFIX}${missing} setting` : 'Settings'),
      make('p', '', 'A switch is turned back by the same again, and stays the way you leave it '
        + 'when Firefox closes.'),
      settingRows(),
    );
  }

  // Each setting the way the commands are listed, with which way a switch is set beside it.
  function settingRows() {
    const list = make('dl');
    for (const c of SETTINGS) {
      const what = make('dd', '', c.summary);
      if (c.on) what.append(' ', make('span', c.on() ? 'state on' : 'state', c.on() ? 'on' : 'off'));
      list.append(make('dt', '', `${SETTINGS_PREFIX}${c.name}  ${SETTINGS_PREFIX}${c.letter}`), what);
    }
    return list;
  }

  // This window's tabs with the keys ;1 to ;9 and ;d1 to ;dz go by, drawn like the hints, so
  // that nobody has to count along the tab strip. Firefox lets no add-on draw on the strip itself,
  // so they are listed here instead. Clicking one does what typing its key would: go to it, or
  // after ;d, unload it. The tabs last heard of are drawn at once, and redrawn when the
  // background script says how they stand now.
  function tabStrip(after) {
    const strip = make('div');
    const fill = () => {
      strip.textContent = '';
      const grid = make('div', 'marks strip');
      windowTabs.slice(0, TAB_KEYS.length)
        .forEach((tab, i) => grid.append(stripRow(tab, i + 1, after)));
      strip.append(grid);
      // Only 1 to 9 can be gone to by typing; a letter after ; on its own is a command.
      if (!after && windowTabs.length > NUMBERED_TABS) {
        strip.append(make('p', 'note', `${COMMAND_PREFIX}1 … ${COMMAND_PREFIX}9 go to the first `
          + `nine; click any to go there, or ${COMMAND_PREFIX}${UNLOAD} and its key to unload it.`));
      }
      const more = windowTabs.length - TAB_KEYS.length;
      if (more > 0) {
        strip.append(make('p', 'note', `And ${more} more, which ${COMMAND_PREFIX}tabs finds by name.`));
      }
    };
    fill();
    browser.runtime.sendMessage('get-strip')
      .then((tabs) => {
        if (!Array.isArray(tabs)) return;
        windowTabs = tabs;
        if (strip.isConnected) fill();
      })
      .catch(() => { /* no answer: the tabs last heard of, if any */ });
    return strip;
  }

  function stripRow(tab, place, after) {
    const row = make('div', `markrow pick${tab.unloaded ? ' gone' : ''}`);
    row.append(make('span', 'tag', TAB_KEYS[place - 1]), iconFor(tab),
      make('span', 'marktitle', tab.title));
    const note = tab.active ? 'this tab' : (tab.unloaded ? 'unloaded' : '');
    if (note) row.append(make('span', 'here', note));
    row.addEventListener('click', () => {
      if (after === UNLOAD) unloadTab(place);
      else tabCommand({ tabAt: place }, `There is no tab ${place} in this window`);
    });
    return row;
  }

  // Each command by its name and then its letter, the way the keys are listed: Tab, then ↓.
  // The tab numbers come after the commands with a letter, and those with none come last.
  function commandRows() {
    const row = (c) => [
      `${COMMAND_PREFIX}${c.name}${c.letter ? `  ${COMMAND_PREFIX}${c.letter}` : ''}`,
      c.summary,
    ];
    return rows([
      ...COMMANDS.filter((c) => c.letter).map(row),
      [`${COMMAND_PREFIX}1 … ${COMMAND_PREFIX}9`, 'go to that tab in this window, counting from the left'],
      [`${COMMAND_PREFIX}${UNLOAD}0 … ${COMMAND_PREFIX}${UNLOAD}z`,
        'unload that tab to free its memory: 0 is this one, then 1 to 9 and a to z'],
      ...COMMANDS.filter((c) => !c.letter).map(row),
      [SETTINGS_PREFIX, 'the settings: these hints, fast commands and Preferences'],
    ]);
  }

  function fastSays() {
    return fastCommands
      ? `${SETTINGS_PREFIX}fast is on: a letter runs its command as soon as it is typed.`
      : `Type the name, or the letter and Enter. ${SETTINGS_PREFIX}fast makes the letter enough.`;
  }

  function fillHelp(panel) {
    panel.append(
      make('h1', '', 'UOKey - Use Only Keyboard'),
      make('p', '', 'Type part of what you can read on a link, button or field. Capitals, '
        + 'accents and the keyboard you type in make no difference.'),

      make('h2', '', 'The bar'),
      rows([
        [shortcutText || 'No shortcut set', 'put this away, leave the hints or a list, then switch the bar off; '
          + 'and take the keyboard back from a field'],
        ['Enter', 'click the orange match, or type in it when it is a field'],
        ['Enter in a field', 'done typing: the bar comes back and takes the keyboard with it'],
        ['Shift+Enter', 'open a link in a tab behind this one'],
        ['Tab  ↓', 'next match'],
        ['Shift+Tab  ↑', 'previous match'],
        ['<  >', 'nudge what the match sits in, or the page; hold to keep going'],
        ['PageUp  PageDown', 'the same, a screen at a time'],
        ['Esc', 'put this away, leave the hints or a list, then close the bar'],
      ]),

      make('h2', '', 'Commands'),
      make('p', '', fastSays()),
      commandRows(),

      make('h2', '', 'Settings'),
      settingRows(),

      make('h2', '', 'While the hints are up'),
      rows([
        ['a hint key', 'click the thing it sits under'],
        ['Space', 'work the hints out again, for whatever the page has just put up'],
        [`${COMMAND_PREFIX}shortcut  Esc`, 'put the hints away'],
      ]),

      make('p', 'note', 'Things with no text of their own are found by their placeholder, '
        + 'label, tooltip or picture description, and a field by whatever has been typed into '
        + 'it - except a password, which is left alone. Firefox lets no extension run on its own '
        + 'pages, so the bar will not open on a new tab, the home page, any about: page or '
        + 'addons.mozilla.org. Other keys for the bar: about:addons → ⚙ → Manage Extension '
        + 'Shortcuts.'),
      make('p', 'star', `Like UOKey? ${COMMAND_PREFIX}github opens its page, where a star helps `
        + 'other people find it.'),
    );
  }

  function rows(pairs) {
    const list = make('dl');
    for (const [keys, what] of pairs) list.append(make('dt', '', keys), make('dd', '', what));
    return list;
  }

  // ---- ;back: Esc for the page --------------------------------------------------------------

  // Esc pressed in the bar is the bar's own: it puts the hints or a list away, then closes the
  // bar, and the page never sees it. ;back is Esc for the page instead - it shuts the menu,
  // submenu or dialog the page has open, and leaves the bar exactly where it was.
  function pressEscape() {
    ui.input.value = '';
    hidePanel();
    if (keyboardInFrame()) toFrames({ uokey: 'back' }); // the keys are in there, so Esc is too
    else escapeThePage();
    opened = null; // whatever the bar was leaving the keyboard for has just been shut
    if (!keyboardInFrame() && mayClaimFocus()) focusBar();
    runSearch(); // the page has changed, and the box is ready for the next thing
  }

  // Esc where the keyboard is, in the page or in the frame it was passed into.
  function escapeThePage() {
    const up = topLayerThing();
    keyPress(escapeTarget(), 'Escape');
    // What the browser itself put on top only answers a real Esc, which no extension can press.
    // If it is still there a moment later, it is asked to go away in its own right.
    if (up) setTimeout(() => dismiss(up), KEY_OPEN);
    indexDirty = true;
  }

  // Where a real Esc would land: whatever in the page holds the keyboard, or else the menu the
  // bar has open or the thing the keyboard came from. The key goes up from there, which is how
  // a page watching for Esc hears it, wherever it happens to be listening.
  function escapeTarget() {
    const el = deepActiveElement();
    const ours = ui.input.getRootNode();
    if (el && el.isConnected && el !== ui.host && el !== document.body
      && el.getRootNode() !== ours) return el;
    if (opened && opened.el.isConnected) return opened.el;
    if (returnFocus && returnFocus.isConnected && returnFocus !== document.body) return returnFocus;
    return document.body || document.documentElement;
  }

  // The last dialog or popover the page has up, which is the one on top. The bar's own is not
  // the page's and never counts.
  function topLayerThing() {
    try {
      const up = [...document.querySelectorAll(':modal, :popover-open')]
        .filter((el) => el !== ui.host);
      return up[up.length - 1] || null;
    } catch {
      return null; // an older Firefox that doesn't know the selectors has no top layer to shut
    }
  }

  function dismiss(el) {
    if (!el.isConnected) return;
    try {
      if (el.localName === 'dialog' && el.matches(':modal')) {
        // What Esc does to a dialog: ask first, and leave it alone if the page says no.
        if (el.dispatchEvent(new Event('cancel', { cancelable: true }))) el.close();
      } else if (el.matches(':popover-open') && el.popover !== 'manual') {
        el.hidePopover(); // a manual popover is not one Esc closes either
      }
    } catch { /* it has gone, or will not be told */ }
  }

  // ---- ;shortcut: a hint key on everything ------------------------------------------------

  function startShort() {
    if (shortMode) {
      stopShort(); // ;shortcut again puts them away: it is a switch, not a button
      ui.input.value = '';
      hidePanel();
      runSearch(); // the name that switched them off is not something to go on showing
      return;
    }
    leaveList(); // a list and the hints are never up together; Enter belongs to one of them
    ui.input.value = '';
    commandMatches = [];
    hidePanel();
    shortMode = true;
    hintPending = null;
    ui.input.placeholder = SHORT_PLACEHOLDER;
    // Worked out here and now. The hints used to wait on the bookmarks being fetched, which
    // meant nothing appeared at all if that answer never came back.
    collectHints();
    showStatus();
    render();
  }

  function leaveShort() {
    if (!inFrame) toFrames({ uokey: 'stop' });
    clearTimeout(hintTimer);
    hintTimer = 0;
    clearTimeout(settleTimer);
    settleTimer = 0;
    shortMode = false;
    hints = [];
    hintCandidates = [];
    frameHints.clear();
    frameCodes.clear();
    hintPending = null;
    if (!ui) return;
    ui.input.placeholder = PLACEHOLDER;
    hidePanel();
    hideTags();
  }

  function stopShort() {
    leaveShort();
    showStatus();
    render();
  }

  function collectHints() {
    // The hints already up are left where they are until the new ones are ready, so that using
    // one doesn't blink them all off the page while the frames answer.
    hintCandidates = clickableElements();
    if (inFrame) return; // a frame is asked what it has; the page hands out the keys
    frameHints.clear();
    frameCodes.clear();
    clearTimeout(hintTimer);
    if (!document.querySelector('iframe, frame')) {
      handOutHints(); // nothing to wait for: straight up, as they always were
      return;
    }
    // The frames have to say how much they have before a single key can be handed out, or a
    // hint in the page would be the start of one inside a frame and neither could be pressed.
    toFrames({ uokey: 'hints' });
    hintTimer = setTimeout(handOutHints, HINT_WAIT);
  }

  // One run of keys for the page and every frame in it, the page's own first, each frame's in
  // the order the frames come.
  function handOutHints() {
    hintTimer = 0;
    if (!isOpen || !shortMode) return;
    const order = [...frameHints.keys()].sort((a, b) => a - b);
    let total = hintCandidates.length;
    for (const count of frameHints.values()) total += count;
    const codes = codeList(Math.min(total, MAX_HINTS), [...HINT_ALPHABET]);
    hints = hintCandidates.slice(0, codes.length).map((el, i) => ({ code: codes[i], el }));
    frameCodes.clear();
    let at = hints.length;
    for (const id of order) {
      const mine = codes.slice(at, at + frameHints.get(id));
      at += mine.length;
      for (const code of mine) frameCodes.set(code, id);
      toFrame(id, { uokey: 'codes', codes: mine });
    }
    showStatus();
    render();
  }

  // One letter each while they fit, two when they don't, so no hint is the start of another.
  function codeList(n, letters) {
    const out = [];
    if (!letters.length) return out;
    if (n <= letters.length) {
      for (let i = 0; i < n; i++) out.push(letters[i]);
      return out;
    }
    for (const a of letters) {
      for (const b of letters) {
        if (out.length >= n) return out;
        out.push(a + b);
      }
    }
    return out;
  }

  // Everything clickable on the page, not only what is on screen: scrolling then brings hints
  // into view instead of renaming the ones already there.
  //
  // One walk down the page, in the order things appear in it. The hand cursor is inherited, so
  // the parent's is carried down rather than asked for again, and a branch nobody can see is
  // stepped over whole. Asking the page for a computed style is the expensive part, and this
  // way each element is asked at most once.
  function clickableElements() {
    const found = [];
    const stack = [[document.documentElement, '']];
    while (stack.length && found.length < MAX_HINTS) {
      const [el, handAbove] = stack.pop();
      if (el === ui.host || !el.checkVisibility(VISIBILITY)) continue;
      const cursor = getComputedStyle(el).cursor;
      if (clickable(el, cursor, handAbove)) {
        const r = el.getBoundingClientRect();
        if (r.width >= 2 && r.height >= 2) found.push(el);
      }
      const shadow = shadowOf(el);
      const kids = shadow ? [...shadow.children, ...el.children] : el.children;
      for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], cursor]);
    }
    return found;
  }

  // What counts as clickable: the things a browser treats that way, and anything the page has
  // given a hand cursor to, which is how most of the web announces a button made out of a div.
  // The search has always worked that way; the hints did not, and missed them.
  //
  // The hand is inherited, so only the element it starts at counts, and not when it is wrapped
  // round a real link or button that is getting a hint of its own.
  function clickable(el, cursor, handAbove) {
    // A frame has a copy of UOKey of its own, which hints what is inside it.
    if (el.localName === 'iframe' || el.localName === 'frame') return false;
    if (el.matches(ACTIONABLE)) return true;
    if (cursor !== 'pointer' || handAbove === 'pointer') return false;
    return !el.querySelector(ACTIONABLE);
  }

  // While the hints are up a hint key is pressed on its own. HINT_PREFIX still works in front of
  // one for anyone who learned it that way, but nothing needs it any more. Keys that are not a
  // hint are left alone, so Tab, Enter, Esc and the arrows still mean what they always did.
  function handleHintKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    // A command can still be typed while the hints are up, so COMMAND_PREFIX and everything
    // after it goes to the bar: that is how ;shortcut puts them away again.
    if (e.key === COMMAND_PREFIX || ui.input.value.startsWith(COMMAND_PREFIX)) return false;
    if (e.key === HINT_PREFIX) {
      e.preventDefault();
      setPending('');
      return true;
    }
    // Space works the hints out again. No hint is spelled with it, and a page that has put
    // something new up - a menu, a dialog, a cookie wall - since the hints were laid gets hints
    // on it without leaving ;shortcut and coming back.
    if (e.key === ' ') {
      e.preventDefault();
      cancelHint(); // half a hint typed means nothing once the keys are handed out afresh
      collectHints();
      showStatus(); // 'looking…', while the frames say what they have, if the page has any
      render();
      return true;
    }
    if (e.key === 'Escape') {
      if (hintPending === null) return false; // nothing half-typed: Esc means put them away
      e.preventDefault();
      cancelHint();
      return true;
    }
    if (e.key === 'Backspace') {
      if (hintPending === null) return false;
      e.preventDefault();
      setPending(hintPending.slice(0, -1) || null);
      return true;
    }
    // The box is not for typing in while the hints are up, so the keys that would move about
    // inside it are swallowed rather than dragging a cursor nobody can see.
    if (DEAD_IN_HINTS.has(e.key)) {
      e.preventDefault();
      return true;
    }
    if (e.key.length !== 1) return false;
    e.preventDefault();
    const typed = (hintPending || '') + e.key.toLowerCase();
    const hit = hints.find((h) => h.code === typed);
    if (hit) {
      swallowKeyUp = e.code;
      setPending(null);
      useHint(hit);
      return true;
    }
    // A hint belonging to one of the page's frames: only the frame can press it.
    const owner = frameCodes.get(typed);
    if (owner !== undefined) {
      swallowKeyUp = e.code;
      setPending(null);
      toFrame(owner, { uokey: 'usecode', code: typed });
      return true;
    }
    if (hints.some((h) => h.code.startsWith(typed)) || startsOne(frameCodes.keys(), typed)) {
      setPending(typed);
      return true;
    }
    cancelHint(); // no hint starts with that
    return true;
  }

  function cancelHint() {
    setPending(null);
  }

  // How far a hint has been typed. The frames are told as well, so that a hint inside one dims
  // or lights up along with the page's own.
  function setPending(value) {
    hintPending = value;
    if (frameCodes.size) toFrames({ uokey: 'typed', prefix: value });
    showStatus();
    render();
  }

  function startsOne(codes, typed) {
    for (const code of codes) if (code.startsWith(typed)) return true;
    return false;
  }

  function useHint(hint) {
    if (!hint.el.isConnected) return;
    const el = hint.el;
    useElement({ target: el, clickEl: el, ranges: [], els: [el] }, el.getBoundingClientRect());
    if (inFrame) {
      toTop({ uokey: 'used' }); // the page works the hints out again, for every frame at once
      return;
    }
    if (!isOpen || !shortMode) return;
    // The page has very likely changed, so the hints are worked out again rather than left
    // pointing at what was there before - now, for a page that changed under the click, and
    // again once it has stopped changing, for anything it opens a moment later.
    collectHints();
    render();
    settleHints();
  }

  // Work the hints out again once the page has gone quiet. Every change restarts the wait, so a
  // menu that fades in is hinted when it has arrived rather than while it is still on its way;
  // SETTLE_LIMIT ends the wait whatever the page is doing, so a page that never settles - a
  // clock, an advert, a feed - still gets its hints.
  function settleHints() {
    settleUntil = performance.now() + SETTLE_LIMIT;
    waitForSettle();
  }

  function waitForSettle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = 0;
      if (!isOpen || !shortMode) return;
      collectHints();
      render();
    }, SETTLE_QUIET);
  }



  function renderTags() {
    let used = 0;
    for (const h of hints) {
      if (!h.el.isConnected) continue;
      const r = h.el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const tag = ui.tags[used] || addTag();
      used++;
      tag.textContent = h.code;
      tag.className = `tag${hintPending ? (h.code.startsWith(hintPending) ? ' hit' : ' dim') : ''}`;
      tag.style.display = 'block';
      // Just under the bottom-left corner: below the thing it belongs to, not over its words.
      tag.style.left = `${Math.max(0, Math.min(r.left, innerWidth - 26))}px`;
      tag.style.top = `${Math.max(0, Math.min(r.bottom - TAG_OVER, innerHeight - 17))}px`;
    }
    for (let i = used; i < ui.tags.length; i++) ui.tags[i].style.display = 'none';
  }

  function hideTags() {
    if (!ui) return;
    for (const tag of ui.tags) tag.style.display = 'none';
  }

  function addTag() {
    const tag = document.createElement('div');
    ui.layer.append(tag);
    ui.tags.push(tag);
    return tag;
  }

  // ---- Lists: ;marks and ;tabs ----------------------------------------------------------------

  // Both are one idea: somewhere to go, narrowed by typing the way a page is. A list says what
  // it is called, where its things come from, what text finds one, which heading it belongs
  // under and what Enter does with it. Everything below this is shared between them.
  const LISTS = {
    marks: {
      placeholder: 'Find a bookmark…',
      ask: 'get-marks',
      verb: '↵ open',
      title: (shown, all) => `Bookmarks (${shown} of ${all})`,
      none: 'No bookmark matches that',
      empty: 'No bookmarks to show. UOKey reads them through the bookmarks permission; if that '
        + 'was turned off in about:addons there is nothing here to find.',
      text: (item) => `${item.title} ${item.url} ${item.folder || ''}`,
      entries: markEntries,
      note: () => '',
      use: (item, newTab) => {
        if (newTab) {
          openNewTab(item.url); // you are staying here, so the bar stays too
          return;
        }
        leaving = true; // going to the bookmark is not switching the bar off
        close(false);
        location.href = item.url;
      },
    },
    tabs: {
      placeholder: 'Find an open tab…',
      ask: 'get-tabs',
      verb: '↵ go there',
      fresh: true, // tabs open and close while you are not looking; bookmarks do not
      title: (shown, all) => `Tabs (${shown} of ${all})`,
      none: 'No open tab matches that',
      empty: 'No tabs to show. UOKey reads them through the tabs permission.',
      text: (item) => `${item.title} ${item.url}`,
      entries: (items) => headed(byName(items, (t) => (t.here ? 'This window' : 'Other windows')),
        () => true, true),
      note: (item) => (item.active ? 'this tab' : ''),
      use: (item) => {
        // Switching tab doesn't unload this one, so its bar is left as it was found.
        browser.runtime.sendMessage({ tab: item.id, window: item.windowId }).catch(() => {});
        stopList();
      },
    },
  };

  function startList(name) {
    const which = LISTS[name];
    if (!which) return;
    if (list === which) {
      stopList(); // the same command again puts the list away
      return;
    }
    leaveShort();
    ui.input.value = '';
    commandMatches = [];
    matches = [];
    current = -1;
    list = which;
    ui.input.placeholder = which.placeholder;
    ensureList(name, which).then((items) => {
      if (list !== which) return; // left again before the answer came back
      listItems = items;
      filterList();
    });
  }

  // A command can still be typed while a list is up, and means the command.
  function inList() {
    return !!list && !ui.input.value.trim().startsWith(COMMAND_PREFIX);
  }

  function leaveList() {
    list = null;
    listItems = [];
    listMatches = [];
    listCurrent = -1;
    if (ui) ui.input.placeholder = PLACEHOLDER;
  }

  function stopList() {
    leaveList();
    ui.input.value = '';
    hidePanel();
    runSearch();
  }

  function ensureList(name, which) {
    if (!which.fresh && listCache.has(name)) return Promise.resolve(listCache.get(name));
    return browser.runtime.sendMessage(which.ask)
      .then((found) => {
        const items = Array.isArray(found)
          ? found.map((item) => ({ ...item, folded: fold(which.text(item)) }))
          : [];
        if (!which.fresh) listCache.set(name, items);
        return items;
      })
      .catch(() => []); // no answer: the panel says there is nothing
  }

  function filterList() {
    rebuildList();
    listCurrent = listMatches.findIndex(pickable);
    showList();
    showStatus();
    render();
  }

  function rebuildList() {
    const query = fold(ui.input.value);
    const found = query ? listItems.filter((item) => item.folded.includes(query)) : listItems;
    listMatches = list.entries(found.slice(0, MAX_LIST), query);
  }

  // Headings that only say what follows are skipped over; a shut folder is a row you can press.
  function pickable(entry) {
    return entry.kind === 'item' || !entry.fixed;
  }

  function byName(items, nameOf) {
    const groups = new Map();
    for (const item of items) {
      const where = nameOf(item);
      if (!groups.has(where)) groups.set(where, []);
      groups.get(where).push(item);
    }
    return [...groups.entries()];
  }

  function headed(groups, isOpen, fixed) {
    const out = [];
    for (const [name, inIt] of groups) {
      const open = isOpen(name);
      out.push({ kind: 'head', name, count: inIt.length, open, fixed: !!fixed });
      if (open) for (const item of inIt) out.push({ kind: 'item', item });
    }
    return out;
  }

  // The bookmarks toolbar is the one you arranged to be at hand, so it comes first and open.
  // The rest are named and shut until you press one, which keeps the list to a screenful.
  function markEntries(items, query) {
    const groups = byName(items, (item) => item.folder || 'Bookmarks');
    if (query) return headed(groups, () => true, true); // looking for one: show what was found
    groups.sort(([a], [b]) => (onToolbar(a) === onToolbar(b)
      ? a.localeCompare(b)
      : (onToolbar(a) ? -1 : 1)));
    return headed(groups, folderOpen, false);
  }

  function onToolbar(name) {
    return /^bookmarks toolbar/i.test(name);
  }

  // The toolbar starts open and everything else starts shut, and either can be changed, so one
  // set holds what has been opened and the other what has been shut.
  function folderOpen(name) {
    return onToolbar(name) ? !shutFolders.has(name) : openFolders.has(name);
  }

  function turnFolder(name) {
    if (folderOpen(name)) {
      if (onToolbar(name)) shutFolders.add(name);
      else openFolders.delete(name);
      return;
    }
    if (onToolbar(name)) shutFolders.delete(name);
    else openFolders.add(name);
  }

  function showList() {
    showPanel(fillList);
    const here = ui.panel.querySelector('.cur');
    if (here) here.scrollIntoView({ block: 'nearest' });
  }

  function fillList(panel) {
    if (!listItems.length) {
      panel.append(make('h1', '', list.placeholder), make('p', '', list.empty));
      return;
    }
    const shown = listMatches.filter((entry) => entry.kind === 'item').length;
    panel.append(make('h1', '', listMatches.length
      ? list.title(shown, listItems.length)
      : list.none));
    let grid = null;
    listMatches.forEach((entry, i) => {
      if (entry.kind === 'head') {
        grid = null;
        if (entry.fixed) panel.append(make('h2', '', entry.name));
        else panel.append(folderRow(entry, i));
        return;
      }
      if (!grid) {
        grid = make('div', 'marks');
        panel.append(grid);
      }
      grid.append(listRow(entry.item, i));
    });
  }

  function folderRow(entry, i) {
    const row = make('div', `folder${i === listCurrent ? ' cur' : ''}`);
    row.append(make('span', 'twist', entry.open ? '▾' : '▸'),
      make('span', 'foldername', entry.name),
      make('span', 'markurl', String(entry.count)));
    return row;
  }

  function listRow(item, i) {
    const row = make('div', `markrow${i === listCurrent ? ' cur' : ''}`);
    row.append(iconFor(item), make('span', 'marktitle', nameFor(item)),
      make('span', 'markurl', addressFor(item)));
    const note = list.note(item);
    if (note) row.append(make('span', 'here', note));
    return row;
  }

  // The site's own icon where one has been kept from a tab, and a letter on a colour of the
  // site's own where not. A page is allowed to forbid loading it, so the letter is the fallback.
  function iconFor(item) {
    const box = make('span', 'favicon');
    const letter = () => {
      box.textContent = initialOf(item);
      box.style.background = colourOf(item.url);
    };
    if (!item.icon) {
      letter();
      return box;
    }
    const picture = document.createElement('img');
    picture.alt = '';
    picture.addEventListener('error', () => {
      picture.remove();
      letter();
    });
    picture.src = item.icon;
    box.append(picture);
    return box;
  }

  function stepList(direction) {
    if (!listMatches.length) return;
    let at = listCurrent;
    for (let step = 0; step < listMatches.length; step++) {
      at = (at + direction + listMatches.length) % listMatches.length;
      if (pickable(listMatches[at])) break;
    }
    listCurrent = at;
    showList();
    showStatus();
  }

  function useList(newTab) {
    const entry = listMatches[listCurrent];
    if (!entry) return;
    if (entry.kind === 'head') {
      turnFolder(entry.name);
      rebuildList();
      // Stay on the folder just opened rather than jumping back to the top of the list.
      const back = listMatches.findIndex((e) => e.kind === 'head' && e.name === entry.name);
      if (back !== -1) listCurrent = back;
      showList();
      showStatus();
      return;
    }
    list.use(entry.item, newTab);
  }

  // A page cannot put a tab behind itself, so background.js opens it.
  function openNewTab(url) {
    browser.runtime.sendMessage({ newTab: url }).catch(() => window.open(url, '_blank'));
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  // The site's first letter, not the thing's own: two of them on one site then look alike.
  function initialOf(item) {
    return (hostOf(item.url) || item.title || '?').charAt(0).toUpperCase();
  }

  // The same site always gets the same colour, so they are told apart by more than the letter.
  function colourOf(url) {
    const host = hostOf(url);
    let hue = 0;
    for (let i = 0; i < host.length; i++) hue = (hue * 31 + host.charCodeAt(i)) % 360;
    return `hsl(${hue}, 60%, 62%)`;
  }

  // Just the site: no http://, no www., nothing after the host either. The bookmark's own name
  // says which page it is, so the address only has to say where it lives. Anything without a
  // host of its own (a file, say) keeps what it had, minus the parts nobody reads.
  function siteOf(url) {
    return hostOf(url) || url.replace(/^[a-z]+:\/\//i, '').replace(/\/$/, '');
  }

  // Plenty of toolbar bookmarks are saved with no name at all, so that the toolbar shows only
  // their icon. A blank is no use here, so the site's name stands in for it and the rest of the
  // address follows, instead of a blank beside a repeat of the same site.
  function nameFor(item) {
    return item.title || siteOf(item.url);
  }

  function addressFor(item) {
    if (item.title) return siteOf(item.url);
    return restOf(item.url) || siteOf(item.url);
  }

  function restOf(url) {
    try {
      const at = new URL(url);
      return (at.pathname + at.search).replace(/\/$/, '');
    } catch {
      return '';
    }
  }

  // ---- Searching ------------------------------------------------------------------------------

  function runSearch() {
    clearTimeout(searchTimer);
    searchTimer = 0;
    const typed = ui.input.value.trim();
    if (typed.startsWith(COMMAND_PREFIX)) {
      askFrames(''); // a command is not something to go looking for in them
      showCommands(typed);
      return;
    }
    if (list) {
      askFrames('');
      filterList();
      return;
    }
    hidePanel();
    commandMatches = [];
    const query = fold(ui.input.value);
    const previous = matches[current];
    matches = [];
    current = -1;
    if (query) {
      ensureIndex();
      matches = findMatches(query);
      // A frame is shown its match when the page says which one is current, not before.
      current = inFrame ? -1 : pickCurrent(previous && previous.target);
      const m = matches[current];
      if (m && (!previous || m.target !== previous.target)) reveal(m);
    }
    askFrames(ui.input.value);
    // Nothing here matches, but a frame may have said it has something.
    if (!inFrame && current < 0 && currentIndex() < 0) goTo(0);
    showStatus();
    render();
  }

  function ensureIndex() {
    if (index && (!indexDirty || performance.now() - indexTime < REINDEX_AFTER)) return;
    index = buildIndex();
    indexDirty = false;
    indexTime = performance.now();
  }

  // All the page's text as one lower-case, accent-free string with single spaces, plus, for
  // each of its characters, the text node and offsets it came from. Also the labels that
  // aren't page text: placeholders, aria-labels, tooltips, image alt text, button values.
  function buildIndex() {
    const nodes = [];
    const chars = [];
    const nodeOf = [];
    const startOf = [];
    const endOf = [];
    const shadowRoots = [];
    let gap = false;

    const addText = (node) => {
      const data = node.data;
      let n = -1;
      for (let k = 0; k < data.length; k++) {
        if (isSpace(data.charCodeAt(k))) {
          gap = true;
          continue;
        }
        const ch = foldChar(data[k]);
        if (!ch) continue;
        if (n === -1) {
          n = nodes.length;
          nodes.push(node);
        }
        const last = chars.length - 1;
        if (gap && last >= 0) {
          // Whitespace collapses to one zero-width space at the end of the previous character.
          chars.push(' ');
          nodeOf.push(nodeOf[last]);
          startOf.push(endOf[last]);
          endOf.push(endOf[last]);
        }
        gap = false;
        chars.push(ch);
        nodeOf.push(n);
        startOf.push(k);
        endOf.push(k + 1);
      }
    };

    const walk = (parent) => {
      for (let node = parent.firstChild; node; node = node.nextSibling) {
        const type = node.nodeType;
        if (type === Node.TEXT_NODE) {
          addText(node);
        } else if (type === Node.ELEMENT_NODE) {
          const tag = node.localName;
          const inline = INLINE_TAGS.has(tag);
          if (!inline) gap = true;
          if (!SKIP_TAGS.has(tag)) {
            const shadow = shadowOf(node);
            if (shadow) {
              shadowRoots.push(shadow);
              walk(shadow);
            }
            walk(node);
          }
          if (!inline) gap = true;
        }
      }
    };
    walk(document.body);

    const labels = [];
    const addLabel = (target, el, value) => {
      const label = value && fold(value);
      if (label) labels.push({ target, el, label });
    };
    for (const root of [document, ...shadowRoots]) {
      for (const el of root.querySelectorAll(ACTIONABLE)) {
        for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
          addLabel(el, el, el.getAttribute(name));
        }
        if (el.localName === 'input' && /^(button|submit|reset)$/.test(el.type)) addLabel(el, el, el.value);
        // What has been typed into a field is its text as much as its placeholder is - more so,
        // because a search box you have already used stops showing the placeholder, and what it
        // shows instead is what you typed. Read off the property rather than the attribute:
        // typing changes only the property, which is why nothing marks the index stale for it.
        // Nothing needs to: the index is built afresh whenever the bar opens, and the bar is
        // shut while you are typing into the page.
        if (el.localName === 'textarea'
          || (el.localName === 'input' && TYPED_TEXT_TYPES.has(el.type))) addLabel(el, el, el.value);
        if (el.localName === 'select') addLabel(el, el, el.selectedOptions[0]?.text);
      }
      for (const img of root.querySelectorAll('img[alt]')) {
        // A picture's description counts for the link or button around it.
        if (!img.matches(ACTIONABLE)) addLabel(null, img, img.getAttribute('alt'));
      }
    }
    return { text: chars.join(''), nodes, nodeOf, startOf, endOf, labels };
  }

  function findMatches(query) {
    const { text, nodes, nodeOf, startOf, endOf, labels } = index;
    const cache = {
      owner: new Map(), style: new Map(), layout: new Map(), clip: new Map(), rect: new Map(),
      visible: new Map(), root: null,
    };
    const found = new Map(); // one match per link/button/field, even if its text matches twice

    for (let i = text.indexOf(query), scanned = 0;
      i !== -1 && scanned < MAX_SCAN && found.size < MAX_MATCHES;
      i = text.indexOf(query, i + 1), scanned++) {
      const last = i + query.length - 1;
      const range = document.createRange();
      try {
        range.setStart(nodes[nodeOf[i]], startOf[i]);
        range.setEnd(nodes[nodeOf[last]], endOf[last]);
      } catch {
        continue; // the page changed since the index was built
      }
      const rect = boxes(range)[0];
      const el = rect && flatParent(nodes[nodeOf[i]]);
      if (!el || !isShown(el, rect, true, cache)) continue;

      let target = ownerOf(el, cache);
      let clickEl = el;
      if (!target) {
        // Plain text can still be clickable: it may have a pointer cursor, or sit under a link
        // stretched over its "card".
        const hit = elementAt(rect) || el;
        const owner = ownerOf(hit, cache);
        if (owner && isNear(owner, el)) {
          target = owner;
          clickEl = hit;
        } else if (!owner && related(hit, el) && style(hit, cache).cursor === 'pointer') {
          target = hit;
          clickEl = hit;
        }
      } else if (!found.has(target) && !isUncovered(rect, target)) {
        continue; // hidden under something else, like a popup
      }
      if (!target || isDisabled(target)) continue;
      const m = found.get(target);
      if (m) m.ranges.push(range);
      else found.set(target, { target, clickEl, rect, ranges: [range], els: [] });
    }

    for (const { target: owner, el, label } of labels) {
      if (found.size >= MAX_MATCHES) break;
      if (!label.includes(query) || !el.isConnected) continue;
      const target = owner || ownerOf(flatParent(el), cache);
      if (!target || found.has(target) || isDisabled(target)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || !isShown(el, rect, false, cache)) continue;
      if (isUncovered(rect, target)) found.set(target, { target, clickEl: el, rect, ranges: [], els: [el] });
    }

    // Reading order: rows from top to bottom (things whose middles line up share a row), then
    // left to right within a row.
    const list = [...found.values()];
    for (const m of list) {
      m.x = m.rect.left + scrollX;
      m.y = m.rect.top + m.rect.height / 2 + scrollY;
    }
    list.sort((a, b) => a.y - b.y);
    let row = 0;
    list.forEach((m, k) => {
      const prev = list[k - 1];
      if (prev && m.y - prev.y > Math.min(m.rect.height, prev.rect.height) / 2) row++;
      m.row = row;
    });
    return list.sort((a, b) => a.row - b.row || a.x - b.x);
  }

  // Keep the same match while typing if it still matches, otherwise take the first one on
  // screen, then the first one below the screen.
  function pickCurrent(previousTarget) {
    if (!matches.length) return -1;
    const kept = matches.findIndex((m) => m.target === previousTarget);
    if (kept !== -1) return kept;
    const onScreen = matches.findIndex((m) => m.rect.bottom > 0 && m.rect.top < innerHeight);
    if (onScreen !== -1) return onScreen;
    const below = matches.findIndex((m) => m.rect.top >= innerHeight);
    return below !== -1 ? below : 0;
  }

  // Nearest element (el itself included) that is a link, button, field, etc.
  function ownerOf(el, cache) {
    if (!el || el === document.body || el === document.documentElement) return null;
    let owner = cache.owner.get(el);
    if (owner === undefined) {
      owner = el.matches(ACTIONABLE) ? el : ownerOf(flatParent(el), cache);
      cache.owner.set(el, owner);
    }
    return owner;
  }

  // Is el in the same small block (e.g. a card) as the link or button laid over it?
  function isNear(owner, el) {
    let block = owner;
    for (let up = 0; up < 3; up++) {
      block = flatParent(block);
      if (!block || block === document.body || block === document.documentElement) return false;
      if (contains(block, el)) return true;
    }
    return false;
  }

  // ---- Visibility -----------------------------------------------------------------------------

  // Can the user see `rect`, the box of el (or of text directly inside el)?
  function isShown(el, rect, isText, cache) {
    if (!isVisible(el, cache)) return false;
    const clip = isText ? contentClip(el, cache) : boxClip(el, cache);
    for (const { el: clipper, x, y } of clip.clips) {
      const box = rectOf(clipper, cache);
      if (x && Math.min(rect.right, box.right) - Math.max(rect.left, box.left) < 2) return false;
      if (y && Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top) < 2) return false;
    }
    if (clip.scrolls) return true;
    if (clip.fixed) return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    return rect.right + scrollX > 0 && rect.bottom + scrollY > 0; // not pushed off the page
  }

  function isVisible(el, cache) {
    let visible = cache.visible.get(el);
    if (visible === undefined) {
      visible = el.checkVisibility(VISIBILITY);
      // A display: contents element (like a <slot>) has no box of its own, so ask its parent.
      if (!visible && style(el, cache).display === 'contents') {
        const parent = flatParent(el);
        visible = !!parent && isVisible(parent, cache);
      }
      cache.visible.set(el, visible);
    }
    return visible;
  }

  // What cuts off things inside el: ancestors with overflow hidden (carousels, "screen reader
  // only" text), and whether they can be scrolled into view or are fixed on screen. Worked out
  // once per element per search, because reading styles is slow.
  function contentClip(el, cache) {
    if (!el || el === document.body || el === document.documentElement) return rootClip(cache);
    let clip = cache.clip.get(el);
    if (!clip) {
      const l = layoutOf(el, cache);
      clip = boxClip(el, cache);
      if (l.clipX || l.clipY || (l.scrolls && !clip.scrolls)) {
        clip = {
          clips: l.clipX || l.clipY ? [...clip.clips, { el, x: l.clipX, y: l.clipY }] : clip.clips,
          scrolls: clip.scrolls || l.scrolls,
          fixed: clip.fixed,
        };
      }
      cache.clip.set(el, clip);
    }
    return clip;
  }

  // What cuts off el's own box.
  function boxClip(el, cache) {
    const { position } = layoutOf(el, cache);
    if (position === 'fixed') return FIXED;
    let parent = flatParent(el);
    if (position === 'absolute') {
      // Only its containing block (the nearest positioned ancestor) and above can clip it.
      while (parent && parent !== document.body && parent !== document.documentElement
          && !layoutOf(parent, cache).containsAbsolute) {
        parent = flatParent(parent);
      }
    }
    return contentClip(parent, cache);
  }

  // The page itself. <body> only scrolls on its own if <html> doesn't pass its overflow to the
  // window; otherwise anything left of or above the page's origin can never be scrolled to.
  function rootClip(cache) {
    if (!cache.root) {
      const html = layoutOf(document.documentElement, cache);
      const body = layoutOf(document.body, cache);
      const htmlVisible = !html.clipX && !html.clipY && !html.scrolls;
      cache.root = { clips: [], scrolls: !htmlVisible && body.scrolls, fixed: false };
    }
    return cache.root;
  }

  function layoutOf(el, cache) {
    let layout = cache.layout.get(el);
    if (!layout) {
      const s = style(el, cache);
      const { position, overflowX, overflowY } = s;
      layout = {
        position,
        containsAbsolute: position !== 'static' || s.transform !== 'none',
        clipX: overflowX === 'hidden' || overflowX === 'clip',
        clipY: overflowY === 'hidden' || overflowY === 'clip',
        scrolls: /auto|scroll/.test(overflowX + overflowY),
      };
      cache.layout.set(el, layout);
    }
    return layout;
  }

  // True unless all of rect we can test is under some other element (a popup, a banner…).
  function isUncovered(rect, target) {
    const v = visiblePart(rect);
    if (!v) return true; // off screen: can't tell
    const y = (v.top + v.bottom) / 2;
    const quarter = (v.right - v.left) / 4;
    for (const x of [v.left + 2 * quarter, v.left + quarter, v.right - quarter]) {
      const hit = elementAtPoint(x, y);
      if (!hit || related(hit, target)) return true;
    }
    return false;
  }

  // The element a real mouse click in the middle of rect would land on; null if off screen.
  function elementAt(rect) {
    const v = visiblePart(rect);
    return v && elementAtPoint((v.left + v.right) / 2, (v.top + v.bottom) / 2);
  }

  function elementAtPoint(x, y) {
    let root = document;
    let hit = null;
    for (let depth = 0; root && depth < 32; depth++) {
      let el = root.elementFromPoint(x, y);
      if (el === ui.host) el = root.elementsFromPoint(x, y).find((e) => e !== ui.host) || null;
      if (!el || el === hit) break;
      hit = el;
      root = shadowOf(el);
    }
    return hit;
  }

  function visiblePart(rect) {
    const left = Math.max(rect.left, 0);
    const right = Math.min(rect.right, innerWidth);
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, innerHeight);
    return right - left >= 1 && bottom - top >= 1 ? { left, right, top, bottom } : null;
  }

  // ---- DOM helpers ----------------------------------------------------------------------------

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function related(a, b) {
    return contains(b, a) || contains(a, b); // a inside b is the common case, so check it first
  }

  function contains(ancestor, node) {
    for (let n = node; n; n = flatParent(n)) if (n === ancestor) return true;
    return false;
  }

  // Parent in the rendered tree: into the slot a node is shown in, out of a shadow root.
  function flatParent(node) {
    const slot = node.openOrClosedAssignedSlot || node.assignedSlot;
    if (slot) return slot;
    const parent = node.parentNode;
    if (!parent) return null;
    if (parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return parent.host || null;
    return parent.nodeType === Node.ELEMENT_NODE ? parent : null;
  }

  function deepActiveElement() {
    let el = document.activeElement;
    while (el) {
      const shadow = shadowOf(el);
      if (!shadow || !shadow.activeElement) break;
      el = shadow.activeElement;
    }
    return el;
  }

  function style(el, cache) {
    let s = cache.style.get(el);
    if (!s) cache.style.set(el, (s = getComputedStyle(el)));
    return s;
  }

  function rectOf(el, cache) {
    let r = cache.rect.get(el);
    if (!r) cache.rect.set(el, (r = el.getBoundingClientRect()));
    return r;
  }

  function boxes(range) {
    return Array.from(range.getClientRects()).filter((r) => r.width >= 1 && r.height >= 1);
  }

  function rectsOf(m) {
    const rects = m.ranges.flatMap(boxes);
    for (const el of m.els) {
      const r = el.getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) rects.push(r);
    }
    return rects;
  }

  // ---- Text folding ---------------------------------------------------------------------------

  function isSpace(c) {
    return c <= 32 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a)
      || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
  }

  const foldCache = new Map();

  // Lower case without accents, so "αναζητηση" finds "Αναζήτηση". One character in, at most
  // one out, so positions in the folded text map straight back to the page.
  function foldChar(ch) {
    const c = ch.charCodeAt(0);
    if (c < 128) return c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : ch;
    let folded = foldCache.get(ch);
    if (folded === undefined) {
      folded = ch.toLowerCase().normalize('NFD').replace(IGNORABLE, '').charAt(0);
      if (folded === 'ς') folded = 'σ';
      foldCache.set(ch, folded);
    }
    return folded;
  }

  function fold(s) {
    let out = '';
    let gap = false;
    for (let k = 0; k < s.length; k++) {
      if (isSpace(s.charCodeAt(k))) {
        gap = true;
        continue;
      }
      const ch = foldChar(s[k]);
      if (!ch) continue;
      if (gap && out) out += ' ';
      gap = false;
      out += ch;
    }
    return out;
  }
})();
