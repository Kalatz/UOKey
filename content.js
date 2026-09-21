/*
 * UOKey: click things on a page without the mouse.
 *
 * Press Ctrl+Space: a small search bar opens at the bottom of the page. Type part of the text
 * of a link, button or field (its visible text, placeholder, label or image alt text) and every
 * match is highlighted. Enter clicks the current match, or puts the cursor in it when it is a
 * text field. Tab / Shift+Tab (or Down / Up) move between matches, Esc closes the bar.
 *
 * Type !short instead and every clickable thing on the page gets a hint key, with back,
 * forward, home and the bookmarks toolbar in a strip above the bar. % then the hint key uses
 * one; ordinary typing still searches the page.
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
  // a-z without b, f and h, which back, forward and home take. Page hints are drawn from this,
  // all one letter while they fit and all two when they don't, so no hint is the start of another.
  const HINT_ALPHABET = 'acdegijklmnopqrstuvwxyz';
  const BOOKMARK_KEYS = '1234567890'; // digits keep bookmarks out of the page hints' way
  const MAX_HINTS = 400;
  const TAG_LIFT = 17; // px a hint sits above its thing; its own height, so they don't overlap
  const COMMANDS = [
    { name: 'help', summary: 'what UOKey does, and every key it uses', fill: fillHelp },
    { name: 'short',
      summary: `a hint key on everything clickable; ${HINT_PREFIX} then the key uses one`,
      run: startShort },
    { name: 'marks', summary: 'find one of your bookmarks by name and open it', run: startMarks },
  ];
  const MARK_PLACEHOLDER = 'Find a bookmark…';
  const MAX_MARKS = 200; // bookmarks listed at once

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
    .bar, .panel, .extras, .strip { box-sizing: border-box; max-width: 100%; border-radius: 12px;
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
    .panel { display: none; width: 38em; max-height: 60vh; overflow-y: auto; padding: 12px 15px;
      font: 13px/1.45 system-ui, sans-serif; }
    .panel h1 { margin: 0; color: #fff; font-size: 14px; }
    .panel p { margin: 3px 0 11px; color: #9aa0a8; }
    .panel dl { display: grid; grid-template-columns: auto 1fr; gap: 7px 16px; margin: 0; }
    .panel dt { color: #ffb13b; font-weight: 600; white-space: nowrap; }
    .panel dd { margin: 0; color: #c9cdd4; }
    .panel .note { margin: 12px 0 0; color: #7d828b; font-size: 12px; }
    /* The strip stands in for Firefox's own toolbar, which an extension cannot draw on. */
    .strip { display: none; flex-wrap: wrap; align-items: center; gap: 6px 14px;
      padding: 8px 12px; font: 12px/1.3 system-ui, sans-serif; }
    .strip.on { display: flex; }
    .sitem { display: flex; align-items: center; gap: 5px; min-width: 0; }
    .skey, .tag { background: #ffd400; color: #1f2125; border-radius: 4px; padding: 1px 5px;
      font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .slabel { color: #c9cdd4; max-width: 16ch; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .more { color: #7d828b; }
    .panel h2 { margin: 13px 0 5px; font: 600 11px/1.3 system-ui, sans-serif;
      text-transform: uppercase; letter-spacing: 0.07em; color: #7d828b; }
    .panel h2:first-of-type { margin-top: 3px; }
    .marks { display: flex; flex-direction: column; gap: 1px; }
    .markrow { display: flex; align-items: center; gap: 9px; padding: 4px 7px;
      border-radius: 6px; min-width: 0; }
    /* A letter on a colour of the site's own: no favicon can be had without asking every
       bookmarked site for one, which would tell them all what you have kept. */
    .favicon { flex: none; width: 17px; height: 17px; border-radius: 4px; color: #17181b;
      display: flex; align-items: center; justify-content: center;
      font: 700 10px/1 system-ui, sans-serif; }
    .markrow.cur { background: rgba(255, 138, 0, 0.18); box-shadow: inset 0 0 0 1px #ff8a00; }
    .marktitle { flex: none; max-width: 24ch; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; color: #e8e8ea; }
    .markurl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #7d828b; }
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
  let shortMode = false;
  let hints = [];
  let hintPending = null; // null: not in a hint; '' or more: keys typed since HINT_PREFIX
  let places = { home: '', bookmarks: [] }; // what background.js knows and the page can't
  let placesAsked = false;
  let markMode = false;
  let marks = [];
  let marksAsked = false;
  let markMatches = [];
  let markCurrent = -1;

  // The keyboard shortcut is handled by background.js, which tells the page to open or close
  // the bar. That way it works wherever the focus is, and can be changed in Firefox's settings.
  browser.runtime.onMessage.addListener((message) => {
    if (message === 'toggle-finder') {
      // Unless the keys were already caught below, which happens first: one press, one toggle.
      if (performance.now() - keyToggleTime > SAME_PRESS) toggle();
    } else if (message && typeof message.shortcut === 'string') {
      setShortcut(message.shortcut);
    }
  });

  // Which keys those are, so the page can watch for them too (see matchesShortcut), and so
  // !help can name them.
  browser.runtime.sendMessage('get-shortcut')
    .then((text) => { if (typeof text === 'string') setShortcut(text); })
    .catch(() => { /* the background script didn't answer: keep the default */ });

  function setShortcut(text) {
    shortcutText = text;
    shortcut = parseShortcut(text); // null: cleared, or keys the page can't watch for
  }

  // Added before the page's own scripts run, so while the bar is open the page never sees the
  // keys typed into it.
  addEventListener('keydown', onKeyDown, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('keypress', stopIfOurs, true);
  addEventListener('pagehide', () => close(false));

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
      if (inMarks()) stepMark(direction);
      else step(direction);
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      swallowKeyUp = e.code;
      if (e.key === 'Enter') {
        if (inMarks()) openMark();
        else activateCurrent();
      } else if (shortMode) stopShort(); // Esc puts the hints away before it closes the bar
      else if (markMode) stopMarks(); // and leaves the bookmarks before it closes the bar
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
    if (isOpen) close(true);
    else open(deepActiveElement());
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
      leaveMarks();
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
    leaveMarks();
    const previous = returnFocus;
    returnFocus = null;
    if (restoreFocus && previous && previous !== document.body && previous.isConnected) {
      previous.focus({ preventScroll: true });
    }
  }

  function onMouseDown(e) {
    if (e.target !== ui.host) close(false);
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
    const strip = make('div', 'strip');
    const dock = make('div', 'dock');
    // On top the dock turns over, so the panel is always the far side and the strip stays
    // next to the bar.
    dock.append(panel, strip, row);
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
    input.addEventListener('blur', () => setTimeout(() => {
      // Focus moved elsewhere in the page (not just to another window): get out of the way.
      if (isOpen && document.hasFocus() && document.activeElement !== host) close(false);
    }));
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
      host, layer, outline, dock, bar, panel, strip, input, count, extras, action, verb, detail,
      observer, boxes: [], tags: [],
    };
  }

  function showStatus() {
    if (shortMode && hintPending !== null) {
      ui.bar.classList.remove('none');
      ui.count.textContent = '';
      ui.action.style.display = '';
      ui.verb.textContent = HINT_PREFIX + hintPending;
      ui.detail.textContent = 'hint key';
      ui.extras.classList.add('on');
      return;
    }
    if (inMarks()) {
      const mark = markMatches[markCurrent];
      ui.bar.classList.toggle('none', !mark);
      ui.count.textContent = `${mark ? markCurrent + 1 : 0}/${markMatches.length}`;
      ui.action.style.display = mark ? '' : 'none';
      if (mark) {
        ui.verb.textContent = '↵ open';
        ui.detail.textContent = shortUrl(mark.url);
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

  function activateCurrent() {
    if (ui.input.value.trim().startsWith(COMMAND_PREFIX)) {
      runCommand();
      return;
    }
    if (searchTimer || (indexDirty && ui.input.value.trim())) runSearch(); // results are stale
    const m = matches[current];
    if (!m) return;
    const rect = rectsOf(m)[0];
    close(false);
    activate(m, rect);
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
      make('h1', '', 'UOKey'),
      make('p', '', 'Click links, buttons and fields with the keyboard instead of the mouse. '
        + 'Type part of what you can read on one: capitals, accents and the keyboard you type '
        + 'in make no difference.'),
      rows([
        [shortcutText || 'No shortcut set', 'open this bar, or close it again'],
        ['Enter', 'click the orange match, or start typing in it when it is a field'],
        ['Tab  ↓', 'next match'],
        ['Shift+Tab  ↑', 'previous match'],
        ['Esc', 'close the bar and put the cursor back where it was'],
        [`${COMMAND_PREFIX}help`, 'this page'],
        [`${COMMAND_PREFIX}short`, 'a hint key on everything clickable'],
        [`${COMMAND_PREFIX}marks`, 'find one of your bookmarks and open it'],
        [`${HINT_PREFIX} then a hint key`, 'use that hint, while the hints are up'],
        ['b  f  h', `with ${HINT_PREFIX}: back, forward, home`],
        ['1 2 3 …', `with ${HINT_PREFIX}: the bookmarks on your bookmarks toolbar`],
      ]),
      make('p', 'note', 'It finds the text you can see, and also the placeholder, label, tooltip '
        + 'or picture description of things that have no text of their own. '
        + 'The bar cannot open on Firefox\'s own pages, such as a new tab or the home page, '
        + 'because Firefox lets no extension run there, and for the same reason the back, '
        + `forward, home and bookmark hints in ${COMMAND_PREFIX}short sit in a strip of their `
        + 'own rather than beside the real buttons. '
        + 'To use other keys for the bar, open about:addons → ⚙ → Manage Extension Shortcuts.'),
    );
  }

  function rows(pairs) {
    const list = make('dl');
    for (const [keys, what] of pairs) list.append(make('dt', '', keys), make('dd', '', what));
    return list;
  }

  // ---- !short: a hint key on everything ---------------------------------------------------

  // An extension cannot draw on Firefox's own toolbar, so back, forward, home and the bookmarks
  // toolbar get a strip of UOKey's own above the bar. The keys still do the real thing.
  function startShort() {
    ui.input.value = '';
    commandMatches = [];
    hidePanel();
    shortMode = true;
    hintPending = null;
    // The page's hints could be worked out here, but the bookmarks have to be asked for, and
    // they take the first keys, so wait and hand out every hint at once.
    ensurePlaces().then(() => {
      if (!shortMode) return;
      collectHints();
      renderStrip();
      showStatus();
      render();
    });
  }

  function stopShort() {
    shortMode = false;
    hints = [];
    hintPending = null;
    renderStrip();
    hideTags();
    showStatus();
    render();
  }

  // background.js holds the bookmarks and the home page; a page is told once and it is kept.
  function ensurePlaces() {
    if (placesAsked) return Promise.resolve(places);
    placesAsked = true;
    return browser.runtime.sendMessage('get-places')
      .then((answer) => {
        if (answer) places = answer;
        return places;
      })
      .catch(() => places); // no answer: the strip still has back and forward
  }

  function collectHints() {
    hints = [
      { code: 'b', label: 'back', kind: 'back', strip: true },
      { code: 'f', label: 'forward', kind: 'forward', strip: true },
    ];
    if (places.home) {
      hints.push({ code: 'h', label: 'home', kind: 'url', url: places.home, strip: true });
    }
    const spare = [...BOOKMARK_KEYS, ...HINT_ALPHABET];
    let n = 0;
    for (const mark of places.bookmarks) {
      if (n >= spare.length) break;
      hints.push({
        code: spare[n++], label: mark.title, kind: 'url', url: mark.url, strip: true, bookmark: true,
      });
    }
    const taken = new Set(hints.map((h) => h.code));
    const letters = [...HINT_ALPHABET].filter((c) => !taken.has(c));
    for (const [el, code] of codesFor(clickableElements(), letters)) {
      hints.push({ code, label: '', kind: 'element', el, strip: false });
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
  function clickableElements() {
    const found = [];
    const roots = [document];
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      for (const el of root.querySelectorAll('*')) {
        if (el === ui.host) continue;
        const shadow = shadowOf(el);
        if (shadow) roots.push(shadow);
      }
      for (const el of root.querySelectorAll(ACTIONABLE)) {
        if (found.length >= MAX_HINTS) return found;
        if (el === ui.host || !el.checkVisibility(VISIBILITY)) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= 2 && r.height >= 2) found.push(el);
      }
    }
    return found;
  }

  // HINT_PREFIX starts a hint and the keys after it pick one. Anything else goes to the bar as
  // usual, so the page can still be searched by its text while the hints are up.
  function handleHintKey(e) {
    if (hintPending === null) {
      if (e.key !== HINT_PREFIX || e.ctrlKey || e.altKey || e.metaKey) return false;
      e.preventDefault();
      hintPending = '';
      showStatus();
      render();
      return true;
    }
    e.preventDefault();
    if (e.key === 'Escape') {
      cancelHint();
      return true;
    }
    if (e.key === 'Backspace') {
      hintPending = hintPending ? hintPending.slice(0, -1) : null;
      showStatus();
      render();
      return true;
    }
    if (e.key.length !== 1) return true; // Shift and the like: the hint is still being typed
    const typed = hintPending + e.key.toLowerCase();
    const hit = hints.find((h) => h.code === typed);
    if (hit) {
      swallowKeyUp = e.code;
      cancelHint();
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
    if (hint.kind === 'back') {
      close(false);
      history.back();
      return;
    }
    if (hint.kind === 'forward') {
      close(false);
      history.forward();
      return;
    }
    if (hint.kind === 'url') {
      close(false);
      location.href = hint.url;
      return;
    }
    if (!hint.el.isConnected) return;
    const rect = hint.el.getBoundingClientRect();
    close(false);
    activate({ target: hint.el, clickEl: hint.el, ranges: [], els: [hint.el] }, rect);
  }

  function renderStrip() {
    if (!ui) return;
    ui.strip.textContent = '';
    const shown = hints.filter((h) => h.strip);
    ui.strip.classList.toggle('on', shortMode && shown.length > 0);
    if (!shortMode) return;
    for (const h of shown) {
      const item = make('span', 'sitem');
      item.append(make('kbd', 'skey', h.code), make('span', 'slabel', h.label));
      ui.strip.append(item);
    }
    const over = places.bookmarks.length - shown.filter((h) => h.bookmark).length;
    if (over > 0) ui.strip.append(make('span', 'more', `+${over} more`));
  }

  function renderTags() {
    let used = 0;
    for (const h of hints) {
      if (h.kind !== 'element' || !h.el.isConnected) continue;
      const r = h.el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const tag = ui.tags[used] || addTag();
      used++;
      tag.textContent = h.code;
      tag.className = `tag${hintPending ? (h.code.startsWith(hintPending) ? ' hit' : ' dim') : ''}`;
      tag.style.display = 'block';
      // Just above the top-left corner, so the hint doesn't sit on the words it belongs to.
      tag.style.left = `${Math.max(0, Math.min(r.left, innerWidth - 26))}px`;
      tag.style.top = `${Math.max(0, r.top - TAG_LIFT)}px`;
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

  // ---- !marks: find a bookmark by name ----------------------------------------------------

  // The bar already knows how to find a thing by typing part of its name. !marks points that at
  // your bookmarks instead of the page, so there is no second way of working to learn.
  function startMarks() {
    ui.input.value = '';
    commandMatches = [];
    matches = [];
    current = -1;
    markMode = true;
    ui.input.placeholder = MARK_PLACEHOLDER;
    ensureMarks().then(() => {
      if (markMode) filterMarks();
    });
  }

  // A command can still be typed while the bookmarks are up, and means the command.
  function inMarks() {
    return markMode && !ui.input.value.trim().startsWith(COMMAND_PREFIX);
  }

  function leaveMarks() {
    markMode = false;
    markMatches = [];
    markCurrent = -1;
    if (ui) ui.input.placeholder = PLACEHOLDER;
  }

  function stopMarks() {
    leaveMarks();
    ui.input.value = '';
    hidePanel();
    runSearch();
  }

  // Asked for once and kept: a bookmark list doesn't change while a bar is open.
  function ensureMarks() {
    if (marksAsked) return Promise.resolve(marks);
    marksAsked = true;
    return browser.runtime.sendMessage('get-marks')
      .then((found) => {
        if (Array.isArray(found)) {
          marks = found.map((mark) => ({
            title: mark.title,
            url: mark.url,
            folder: mark.folder || '',
            // Title, address or the folder it is kept in: any of the three will find it.
            folded: fold(`${mark.title} ${mark.url} ${mark.folder || ''}`),
          }));
        }
        return marks;
      })
      .catch(() => marks); // no answer: the panel says there are none
  }

  function filterMarks() {
    const query = fold(ui.input.value);
    const found = query ? marks.filter((mark) => mark.folded.includes(query)) : marks;
    markMatches = found.slice(0, MAX_MARKS);
    markCurrent = markMatches.length ? 0 : -1;
    showMarks();
    showStatus();
    render();
  }

  function showMarks() {
    showPanel(fillMarks);
    const here = ui.panel.querySelector('.cur');
    if (here) here.scrollIntoView({ block: 'nearest' });
  }

  function fillMarks(panel) {
    if (!marks.length) {
      panel.append(
        make('h1', '', 'Bookmarks'),
        make('p', '', 'None to show. UOKey reads them through the bookmarks permission; if that '
          + 'was turned off in about:addons there is nothing here to find.'),
      );
      return;
    }
    panel.append(make('h1', '', markMatches.length
      ? `Bookmarks (${markMatches.length} of ${marks.length})`
      : 'No bookmark matches that'));
    // Kept in the folders they live in, in the order they first turn up, so a long list reads
    // like the bookmark menu rather than one run of names.
    const folders = new Map();
    markMatches.forEach((mark, i) => {
      const where = mark.folder || 'Bookmarks';
      if (!folders.has(where)) folders.set(where, []);
      folders.get(where).push([mark, i]);
    });
    for (const [where, inIt] of folders) {
      panel.append(make('h2', '', where));
      const list = make('div', 'marks');
      for (const [mark, i] of inIt) list.append(markRow(mark, i));
      panel.append(list);
    }
  }

  function markRow(mark, i) {
    const row = make('div', `markrow${i === markCurrent ? ' cur' : ''}`);
    const icon = make('span', 'favicon', initialOf(mark));
    icon.style.background = colourOf(mark.url);
    row.append(icon, make('span', 'marktitle', mark.title),
      make('span', 'markurl', shortUrl(mark.url)));
    return row;
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  // The site's first letter, not the bookmark's: two bookmarks on one site then look alike.
  function initialOf(mark) {
    return (hostOf(mark.url) || mark.title || '?').charAt(0).toUpperCase();
  }

  // The same site always gets the same colour, so they are told apart by more than the letter.
  function colourOf(url) {
    const host = hostOf(url);
    let hue = 0;
    for (let i = 0; i < host.length; i++) hue = (hue * 31 + host.charCodeAt(i)) % 360;
    return `hsl(${hue}, 60%, 62%)`;
  }

  function stepMark(direction) {
    if (!markMatches.length) return;
    markCurrent = (markCurrent + direction + markMatches.length) % markMatches.length;
    showMarks();
    showStatus();
  }

  function openMark() {
    const mark = markMatches[markCurrent];
    if (!mark) return;
    close(false);
    location.href = mark.url;
  }

  function shortUrl(url) {
    return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
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
    if (markMode) {
      filterMarks();
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
