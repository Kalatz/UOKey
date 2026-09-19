/*
 * UOKey: click things on a page without the mouse.
 *
 * Press Ctrl+Shift+F: a small search bar opens at the bottom of the page. Type part of the text
 * of a link, button or field (its visible text, placeholder, label or image alt text) and every
 * match is highlighted. Enter clicks the current match, or puts the cursor in it when it is a
 * text field. Tab / Shift+Tab (or Down / Up) move between matches, Esc closes the bar.
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
  const ONE_LETTER_DELAY = 200; // ms to wait for a second letter before searching for just one
  const REINDEX_AFTER = 1000; // ms; while typing, re-read a page that keeps changing at most this often
  const MAX_SCAN = 3000; // text occurrences examined per search
  const MAX_MATCHES = 300; // matches kept per search
  const FIXED = { clips: [], scrolls: false, fixed: true };
  const PLACEHOLDER = 'Find a link, button or field…';

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
    .bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 12px; box-sizing: border-box;
      max-width: calc(100vw - 32px); padding: 7px 14px 7px 7px; border-radius: 12px;
      background: #1f2125; color: #e8e8ea; pointer-events: auto; white-space: nowrap;
      font: 13px/1.3 system-ui, sans-serif;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08); }
    .bar.top { top: 18px; bottom: auto; }
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
    .keys { color: #7d828b; font-size: 12px; }
    .keys b { color: #b9bdc4; font-weight: 600; }
    @media (max-width: 700px) { .keys, .detail { display: none; } }
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

  // The keyboard shortcut is handled by background.js, which tells the page to open or close
  // the bar. That way it works wherever the focus is, and can be changed in Firefox's settings.
  browser.runtime.onMessage.addListener((message) => {
    if (message !== 'toggle-finder') return;
    if (isOpen) close(true);
    else open(deepActiveElement());
  });

  // Added before the page's own scripts run, so while the bar is open the page never sees the
  // keys typed into it.
  addEventListener('keydown', onKeyDown, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('keypress', stopIfOurs, true);
  addEventListener('pagehide', () => close(false));

  // ---- Keyboard -------------------------------------------------------------------------------

  function onKeyDown(e) {
    if (!isOpen || e.target !== ui.host) return;
    e.stopImmediatePropagation(); // keep the page's own keyboard shortcuts out of it
    if (!e.isTrusted || e.isComposing) return;
    if (e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1);
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      swallowKeyUp = e.code;
      if (e.key === 'Enter') activateCurrent();
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

  // ---- Bar and highlights ---------------------------------------------------------------------

  function open(before) {
    if (!document.body) return;
    returnFocus = before;
    if (!ui) ui = createUI();
    if (!isOpen) {
      isOpen = true;
      document.documentElement.append(ui.host);
      ui.input.value = '';
      ui.bar.classList.remove('top');
      matches = [];
      current = -1;
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
    const make = (tag, className, text) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (text) el.textContent = text;
      return el;
    };
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
    const keys = make('span', 'keys');
    keys.append(make('b', '', 'Tab'), ' next · ', make('b', '', 'Esc'), ' close');
    const bar = make('div', 'bar');
    bar.append(input, count, action, keys);
    root.append(make('style', '', CSS), layer, bar);

    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = 0;
      // One letter matches half the page, which is slow; wait a moment for the next one.
      if (fold(input.value).length === 1) searchTimer = setTimeout(runSearch, ONE_LETTER_DELAY);
      else runSearch();
    });
    input.addEventListener('blur', () => setTimeout(() => {
      // Focus moved elsewhere in the page (not just to another window): get out of the way.
      if (isOpen && document.hasFocus() && document.activeElement !== host) close(false);
    }));
    // Clicking the bar itself must not take focus away from the input.
    bar.addEventListener('mousedown', (e) => {
      if (e.target !== input) e.preventDefault();
    });
    const observer = new MutationObserver((records) => {
      if (!indexDirty) {
        indexDirty = records.some((r) => r.type !== 'attributes' || INDEXED_ATTRIBUTES.has(r.attributeName));
      }
      scheduleRender();
    });
    return { host, layer, outline, bar, input, count, action, verb, detail, observer, boxes: [] };
  }

  function showStatus() {
    const typed = ui.input.value.trim() !== '';
    const m = matches[current];
    ui.bar.classList.toggle('none', typed && !m);
    ui.count.textContent = typed ? `${m ? current + 1 : 0}/${matches.length}` : '';
    ui.action.style.display = m ? '' : 'none';
    if (m) {
      const [verb, detail] = describe(m.target);
      ui.verb.textContent = `↵ ${verb}`;
      ui.detail.textContent = detail;
    }
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
      ui.bar.classList.toggle('top',
        first.bottom > barTop && first.left < bar.right + 8 && first.right > bar.left - 8);
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

  // ---- Searching ------------------------------------------------------------------------------

  function runSearch() {
    clearTimeout(searchTimer);
    searchTimer = 0;
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
