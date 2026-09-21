/*
 * UOKey: click things on a page without the mouse.
 *
 * Press Ctrl+Space: a small search bar opens at the bottom of the page. Type part of the text
 * of a link, button or field (its visible text, placeholder, label or image alt text) and every
 * match is highlighted. Enter clicks the current match, or puts the cursor in it when it is a
 * text field. Tab / Shift+Tab (or Down / Up) move between matches, Esc closes the bar.
 *
 * Type !short instead and every clickable thing on the page gets a hint key just under it.
 * Press that key to use it; !short again, or Esc, puts them away.
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

  // Attribute changes that affect the index: labels, and whether something is clickable.
  const INDEXED_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'value',
    'href', 'role', 'onclick', 'contenteditable', 'type']);

  const VISIBILITY = {
    opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true,
  };
  const IGNORABLE = /[\p{M}\p{Cf}]/gu; // accents, soft hyphens, zero-width and direction marks
  const DEFAULT_SHORTCUT = 'Ctrl+Space';
  const SAME_PRESS = 1000; // ms; Firefox's own shortcut arriving after we handled the same keys
  // Where the keys Firefox lets a shortcut use sit on the keyboard, for the ones that aren't
  // letters or digits.
  const KEY_CODES = {
    Comma: 'Comma', Period: 'Period', Space: 'Space', Home: 'Home', End: 'End',
    PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete',
    Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
  };
  const ONE_LETTER_DELAY = 200; // ms to wait for a second letter before searching for just one
  const REINDEX_AFTER = 1000; // ms; while typing, re-read a page that keeps changing at most this often
  const MAX_SCAN = 3000; // text occurrences examined per search
  const MAX_MATCHES = 300; // matches kept per search
  const FIXED = { clips: [], scrolls: false, fixed: true };
  const PLACEHOLDER = 'Find a link, button or field…';
  // Typing this instead of text to find asks UOKey itself for something. No page text starts
  // with it, so nothing that can be clicked is ever out of reach behind it.
  const COMMAND_PREFIX = '!';
  // In !short, this marks the next key or two as a hint rather than text to find on the page.
  const HINT_PREFIX = '%';
  // Home row first, so the hints that get handed out first are the easiest to reach. All one
  // letter while they fit and all two when they don't, so no hint is the start of another.
  const HINT_ALPHABET = 'asdfghjklqwertyuiopzxcvbnm';
  const MAX_HINTS = 676; // as many as two letters of the alphabet can name
  const TAG_OVER = 2; // px a hint sits over the bottom edge of its thing, so they read as one
  const COMMANDS = [
    { name: 'help', summary: 'what UOKey does, and every key it uses', fill: fillHelp },
    { name: 'short',
      summary: 'a hint key on everything clickable; press one to use it',
      run: startShort },
    { name: 'marks',
      summary: 'find one of your bookmarks by name and open it',
      run: () => startList('marks') },
    { name: 'tabs',
      summary: 'find one of your open tabs by name and go to it',
      run: () => startList('tabs') },
  ];
  const MAX_LIST = 200; // bookmarks or tabs listed at once
  const SHORT_PLACEHOLDER = 'Press a hint key…';
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
    .bar { display: flex; padding: 7px; font: 13px/1.3 system-ui, sans-serif; }
    /* Beside the typing box, so that it stays where it is however much there is to say. */
    .extras { display: none; position: absolute; left: 100%; top: 0; bottom: 0; margin-left: 8px;
      align-items: center; gap: 10px; padding: 0 13px; overflow: hidden; white-space: nowrap;
      max-width: calc(50vw - 160px); font: 13px/1.3 system-ui, sans-serif; }
    .extras.on { display: flex; }
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
      font: 13px/1.45 system-ui, sans-serif; }
    .panel h1 { margin: 0; color: #fff; font-size: 14px; }
    .panel p { margin: 3px 0 11px; color: #9aa0a8; }
    .panel dl { display: grid; grid-template-columns: auto 1fr; gap: 7px 16px; margin: 0; }
    .panel dt { color: #ffb13b; font-weight: 600; white-space: nowrap; }
    .panel dd { margin: 0; color: #c9cdd4; }
    .panel .note { margin: 12px 0 0; color: #7d828b; font-size: 12px; }
    .tag { background: #ffd400; color: #1f2125; border-radius: 4px; padding: 1px 5px;
      font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .panel h2 { margin: 13px 0 5px; font: 600 11px/1.3 system-ui, sans-serif;
      text-transform: uppercase; letter-spacing: 0.07em; color: #7d828b; }
    .panel h2:first-of-type { margin-top: 3px; }
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
    .tag { position: absolute; display: none; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45); }
    .tag.dim { opacity: 0.25; }
    .tag.hit { background: #ff8a00; }
    @media (max-width: 700px) { .detail { display: none; } }
  `;

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
  let commandMatches = [];
  let leaving = false; // the page is going; closing the bar now is not the user's doing
  let echo = true; // whether a change here is the user's doing and should reach the other tabs
  let shortMode = false;
  let hints = [];
  let hintPending = null; // null: not in a hint; '' or more: keys typed since HINT_PREFIX
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
      if (performance.now() - keyToggleTime > SAME_PRESS) toggle();
    } else if (message === 'bar-on') {
      if (!isOpen && document.body) quietly(() => open(deepActiveElement()));
    } else if (message === 'bar-off') {
      if (isOpen) quietly(() => close(false));
    } else if (message && typeof message.shortcut === 'string') {
      setShortcut(message.shortcut);
    }
  });

  // Which keys those are, so the page can watch for them too (see matchesShortcut), and so
  // !help can name them.
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
    if (e.isTrusted && matchesShortcut(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      swallowKeyUp = e.code;
      if (!e.repeat) {
        keyToggleTime = performance.now();
        toggle();
      }
      return;
    }
    if (!isOpen || e.target !== ui.host) return;
    e.stopImmediatePropagation(); // keep the page's own keyboard shortcuts out of it
    if (!e.isTrusted || e.isComposing) return;
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
    }
  }

  function onKeyUp(e) {
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
    if (isOpen && e.target === ui.host) e.stopImmediatePropagation();
  }

  function toggle() {
    if (!isOpen) {
      open(deepActiveElement());
      return;
    }
    // One press backs out of whatever is running, the same way Esc does, and only switches the
    // bar off once there is nothing left to back out of.
    if (shortMode) startShort(); // a switch: this puts the hints away and tidies the box
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
      addEventListener('focus', onPageFocus);
      // Read the page while the user starts typing, so the first key is quick.
      requestIdleCallback(() => {
        if (isOpen) ensureIndex();
      }, { timeout: 300 });
    }
    ui.input.focus({ preventScroll: true });
    // A page can't take the keyboard from Firefox's own toolbar (e.g. the address bar). F6 moves
    // it to the page, and onPageFocus then puts it in the bar.
    ui.input.placeholder = document.hasFocus() ? PLACEHOLDER : 'Press F6 to type here';
  }

  // The page got the keyboard (back) while the bar is open: the cursor belongs in the bar.
  function onPageFocus() {
    if (document.activeElement !== ui.host) ui.input.focus({ preventScroll: true });
    ui.input.placeholder = PLACEHOLDER;
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
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(searchTimer);
    searchTimer = 0;
    ui.host.remove();
    matches = [];
    index = null;
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
    host.style.cssText = 'all: initial !important; position: fixed !important; inset: 0 !important;'
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
    const bar = make('div', 'bar');
    bar.append(input);
    // The bar holds nothing but the box to type in, and the row holds nothing but the bar, so
    // what is centred on the screen is the typing box itself. The count and what Enter will do
    // hang off its side without moving it.
    const row = make('div', 'row');
    row.append(bar, extras);
    const panel = make('div', 'panel');
    const dock = make('div', 'dock');
    dock.append(panel, row); // on top the dock turns over, so the panel is always the far side
    root.append(make('style', '', CSS), layer, dock);

    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = 0;
      const text = fold(input.value);
      // One letter matches half the page, which is slow; wait a moment for the next one.
      // Commands search nothing, so they answer straight away.
      if (text.length === 1 && !text.startsWith(COMMAND_PREFIX)) {
        searchTimer = setTimeout(runSearch, ONE_LETTER_DELAY);
      } else {
        runSearch();
      }
    });
    // Clicking the bar or the panel must not take focus away from the input.
    dock.addEventListener('mousedown', (e) => {
      if (e.target !== input) e.preventDefault();
    });
    const observer = new MutationObserver((records) => {
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

  function showStatus() {
    if (shortMode && !ui.input.value.trim().startsWith(COMMAND_PREFIX)) {
      ui.bar.classList.remove('none');
      ui.count.textContent = '';
      ui.action.style.display = '';
      ui.verb.textContent = hintPending || 'hints';
      ui.detail.textContent = hintPending ? 'keep going'
        : (hints.length
          ? `${hints.length} on this page — ${COMMAND_PREFIX}short or Esc to stop`
          : 'nothing on this page can be clicked');
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
      const command = commandMatches[0];
      // Enter only has something left to do while the name is still half-typed.
      const finishes = command && command.name !== text.slice(COMMAND_PREFIX.length).trim().toLowerCase();
      ui.bar.classList.toggle('none', !command);
      ui.count.textContent = '';
      ui.action.style.display = finishes ? '' : 'none';
      if (finishes) {
        ui.verb.textContent = `↵ ${COMMAND_PREFIX}${command.name}`;
        ui.detail.textContent = command.summary;
      }
      ui.extras.classList.toggle('on', !!finishes);
      return;
    }
    const m = matches[current];
    ui.bar.classList.toggle('none', text !== '' && !m);
    ui.count.textContent = text ? `${m ? current + 1 : 0}/${matches.length}` : '';
    ui.action.style.display = m ? '' : 'none';
    if (m) {
      const [verb, detail] = describe(m.target);
      ui.verb.textContent = `↵ ${verb}`;
      ui.detail.textContent = detail;
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
  // Moving it takes the keyboard with it, which has to be handed back.
  function stayOnTop() {
    const top = document.documentElement;
    if (!top || ui.host === top.lastElementChild) return;
    const had = document.activeElement === ui.host;
    top.append(ui.host);
    if (had) ui.input.focus({ preventScroll: true });
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
    if (!matches.length) return;
    current = (current + direction + matches.length) % matches.length;
    reveal(matches[current]);
    showStatus();
    render();
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
    if (searchTimer || (indexDirty && ui.input.value.trim())) runSearch(); // results are stale
    const m = matches[current];
    if (!m) return;
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
      close(false);
      activate(m, rect);
      return;
    }
    activate(m, rect);
    if (!isOpen) return; // it was a link, and the page is on its way somewhere else
    ui.input.focus({ preventScroll: true });
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

  function activate(m, rect) {
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
    el.focus({ preventScroll: true });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) fire(clickEl, type, x, y);
    if (typeof clickEl.click === 'function') clickEl.click();
    else fire(clickEl, 'click', x, y);
  }

  function fire(el, type, x, y) {
    const init = {
      bubbles: true, cancelable: true, composed: true, view: window, detail: 1,
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

  // ---- Commands -------------------------------------------------------------------------------

  // The bar holds a command instead of text to find: show what it does, or what could be meant.
  function showCommands(typed) {
    matches = [];
    current = -1;
    const name = typed.slice(COMMAND_PREFIX.length).trim().toLowerCase();
    commandMatches = COMMANDS.filter((c) => c.name.startsWith(name));
    const exact = COMMANDS.find((c) => c.name === name);
    if (exact && exact.run) {
      exact.run(); // a command that does something rather than saying something
      return;
    }
    showPanel(exact ? exact.fill : (panel) => fillCommandList(panel, name));
    showStatus();
    render();
  }

  // Enter on a command: finish typing its name, which shows what it has to say.
  function runCommand() {
    const command = commandMatches[0];
    if (!command) return;
    ui.input.value = COMMAND_PREFIX + command.name;
    runSearch();
  }

  function showPanel(fill) {
    ui.panel.textContent = '';
    fill(ui.panel);
    ui.panel.style.display = 'block';
    ui.panel.scrollTop = 0;
  }

  function hidePanel() {
    if (!ui.panel.style.display) return;
    ui.panel.style.display = '';
    ui.panel.textContent = '';
  }

  function fillCommandList(panel, name) {
    panel.append(make('h1', '', commandMatches.length
      ? 'Commands'
      : `There is no ${COMMAND_PREFIX}${name} command`));
    panel.append(rows(COMMANDS.map((c) => [COMMAND_PREFIX + c.name, c.summary])));
  }

  function fillHelp(panel) {
    panel.append(
      make('h1', '', 'UOKey — Use Only Keyboard'),
      make('p', '', 'Type part of what you can read on a link, button or field. Capitals, '
        + 'accents and the keyboard you type in make no difference.'),

      make('h2', '', 'The bar'),
      rows([
        [shortcutText || 'No shortcut set', 'leave the hints or a list, then switch the bar off'],
        ['Enter', 'click the orange match, or type in it when it is a field'],
        ['Shift+Enter', 'open a link in a tab behind this one'],
        ['Tab  ↓', 'next match'],
        ['Shift+Tab  ↑', 'previous match'],
        ['Esc', 'leave the hints or a list, then close the bar'],
      ]),

      make('h2', '', 'Commands'),
      rows(COMMANDS.map((command) => [COMMAND_PREFIX + command.name, command.summary])),

      make('h2', '', 'While the hints are up'),
      rows([
        ['a hint key', 'click the thing it sits under'],
        [`${COMMAND_PREFIX}short  Esc`, 'put the hints away'],
      ]),

      make('p', 'note', 'Things with no text of their own are found by their placeholder, '
        + 'label, tooltip or picture description. Firefox lets no extension run on its own '
        + 'pages, so the bar will not open on a new tab, the home page, any about: page or '
        + 'addons.mozilla.org. Other keys for the bar: about:addons → ⚙ → Manage Extension '
        + 'Shortcuts.'),
    );
  }

  function rows(pairs) {
    const list = make('dl');
    for (const [keys, what] of pairs) list.append(make('dt', '', keys), make('dd', '', what));
    return list;
  }

  // ---- !short: a hint key on everything ---------------------------------------------------

  function startShort() {
    if (shortMode) {
      stopShort(); // !short again puts them away: it is a switch, not a button
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
    shortMode = false;
    hints = [];
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
    hints = [];
    for (const [el, code] of codesFor(clickableElements(), [...HINT_ALPHABET])) {
      hints.push({ code, el });
    }
  }

  // One letter each while they fit, two when they don't, so no hint is the start of another.
  function codesFor(els, letters) {
    const out = [];
    if (!letters.length) return out;
    if (els.length <= letters.length) {
      els.forEach((el, i) => out.push([el, letters[i]]));
      return out;
    }
    let i = 0;
    for (const a of letters) {
      for (const b of letters) {
        if (i >= els.length) return out;
        out.push([els[i++], a + b]);
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
    // after it goes to the bar: that is how !short puts them away again.
    if (e.key === COMMAND_PREFIX || ui.input.value.startsWith(COMMAND_PREFIX)) return false;
    if (e.key === HINT_PREFIX) {
      e.preventDefault();
      hintPending = '';
      showStatus();
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
      hintPending = hintPending.slice(0, -1) || null;
      showStatus();
      render();
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
      hintPending = null;
      showStatus();
      useHint(hit);
      return true;
    }
    if (hints.some((h) => h.code.startsWith(typed))) {
      hintPending = typed;
      showStatus();
      render();
      return true;
    }
    cancelHint(); // no hint starts with that
    return true;
  }

  function cancelHint() {
    hintPending = null;
    showStatus();
    render();
  }

  function useHint(hint) {
    if (!hint.el.isConnected) return;
    const el = hint.el;
    useElement({ target: el, clickEl: el, ranges: [], els: [el] }, el.getBoundingClientRect());
    if (!isOpen || !shortMode) return;
    // The page has very likely changed, so the hints are worked out again rather than left
    // pointing at what was there before.
    collectHints();
    render();
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

  // ---- Lists: !marks and !tabs ----------------------------------------------------------------

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
      showCommands(typed);
      return;
    }
    if (list) {
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
      current = pickCurrent(previous && previous.target);
      const m = matches[current];
      if (m && (!previous || m.target !== previous.target)) reveal(m);
    }
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
