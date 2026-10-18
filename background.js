// Firefox runs this when the UOKey shortcut is pressed (Ctrl+Space unless changed in
// about:addons → ⚙ → Manage Extension Shortcuts). The search bar lives in content.js, so pass
// the request on to the page in the current tab.
const DEFAULT_SHORTCUT = 'Ctrl+Space';

// The shortcut as it stands, which is '' when it has been cleared in about:addons.
async function currentShortcut() {
  const commands = await browser.commands.getAll();
  const command = commands.find((c) => c.name === 'toggle-finder');
  return command ? command.shortcut || '' : DEFAULT_SHORTCUT;
}

// A page's frames each run their own copy of content.js, so a message with no frame named goes
// to all of them. TOP_FRAME is the page itself, which is where the bar lives.
const TOP_FRAME = 0;

async function tell(tabId, message, frameId) {
  try {
    await browser.tabs.sendMessage(tabId, message, frameId === undefined ? {} : { frameId });
  } catch {
    // No content script on this page: Firefox's own pages (about:, the add-ons site, …).
  }
}

browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-finder') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  // Only the page itself: the bar is one per page, not one per frame in it.
  if (tab) await tell(tab.id, 'toggle-finder', TOP_FRAME);
});

// The copies of content.js in one page's frames have no way of reaching each other, so this
// passes a message between them. `relay` is the frame to say it to, or 'all' for every one of
// them, and the frame it came from is added so that an answer can be sent back.
function passOn(message, sender) {
  const tab = sender.tab && sender.tab.id;
  if (tab === undefined) return Promise.resolve(false);
  const body = { ...message.body, from: sender.frameId };
  tell(tab, body, message.relay === 'all' ? undefined : message.relay);
  return Promise.resolve(true);
}

// A shortcut written with a letter only reaches the listener above when the keyboard types that
// Latin letter, so with a Greek layout (or Russian, Hebrew, …) it never runs. content.js watches
// for the keys itself as well, and asks here which ones they are.
// Whether the bar is meant to be up. Ctrl+Space is a switch, and a switch that only held for
// the page it was pressed on would have to be pressed again on every page.
//
// Firefox stops this script when nothing has happened for a while and starts it again when
// something does, so a variable on its own forgets the switch a minute after it was thrown, and
// the next page to load is told the bar is off. Session storage is kept for it while the script
// is away and emptied when Firefox closes, which is exactly how long the switch is meant to last.
const BAR_STATE = 'barWanted';
let barWanted = null; // what session storage says, once it has been read

async function barIsWanted() {
  if (barWanted === null) {
    try {
      const kept = await browser.storage.session.get(BAR_STATE);
      barWanted = !!kept[BAR_STATE];
    } catch {
      barWanted = false; // no session storage here: the switch lasts only while this script does
    }
  }
  return barWanted;
}

async function rememberBar(on) {
  barWanted = !!on;
  try {
    await browser.storage.session.set({ [BAR_STATE]: barWanted });
  } catch {
    /* nothing to do: the switch still holds while this script is running */
  }
  return barWanted;
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message === 'get-shortcut') return currentShortcut();
  if (message && message.relay !== undefined) return passOn(message, sender);
  if (message === 'bar-state') return barIsWanted();
  if (message && message.bar !== undefined) {
    spreadBar(!!message.bar);
    return rememberBar(message.bar);
  }
  if (message === 'get-marks') return allBookmarks();
  if (message === 'get-tabs') return openTabs();
  if (message && message.tab !== undefined) return focusTab(message.tab, message.window);
  if (message && message.tabAt !== undefined) return tabAt(message.tabAt, sender);
  if (message === 'last-tab') return lastTab(sender);
  if (message === 'get-strip') return numberedTabs(sender);
  if (message && message.unload !== undefined) return unloadAt(message.unload, sender);
  if (message && message.newTab) return newTab(message.newTab, sender, message.front);
  if (message === 'open-settings') {
    return browser.runtime.openOptionsPage().then(() => true, () => false);
  }
  return undefined;
});

// Addresses a page can actually be sent to: not javascript: bookmarklets or place: queries.
const NAVIGABLE = /^(https?|ftp|file):/i;

// ---- Favicons ---------------------------------------------------------------------------------

// The icons are never fetched from anywhere. Firefox hands one over whenever a tab settles on a
// page, and those are kept, so ;marks and ;tabs can show the icon of a site you have been to
// without a single request going out and without telling any site what you have bookmarked.
const ICON_STORE = 'siteIcons';
const MAX_ICONS = 400;
let icons = null;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function siteIcons() {
  if (icons) return icons;
  try {
    const kept = await browser.storage.local.get(ICON_STORE);
    icons = kept[ICON_STORE] || {};
  } catch {
    icons = {};
  }
  return icons;
}

browser.tabs.onUpdated.addListener(async (id, change, tab) => {
  if (!change.favIconUrl || !tab.url) return;
  if (unloading.has(id)) return; // a frame of the fade, not the site's own icon
  const host = hostOf(tab.url);
  if (!host) return;
  const kept = await siteIcons();
  if (kept[host] === change.favIconUrl) return;
  kept[host] = change.favIconUrl;
  // Oldest first out, so a lifetime of browsing doesn't turn into a lifetime of storage.
  const hosts = Object.keys(kept);
  for (let i = 0; i < hosts.length - MAX_ICONS; i++) delete kept[hosts[i]];
  try {
    await browser.storage.local.set({ [ICON_STORE]: kept });
  } catch {
    /* storage is full or turned off: the letter squares still work */
  }
});

// Every bookmark there is, for ;marks, each with the folder it sits in so the panel can group
// them the way they are kept. Walked rather than searched, because a flat search knows only a
// parentId and the folder's name is what is worth showing.
async function allBookmarks() {
  try {
    const [root] = await browser.bookmarks.getTree();
    const found = [];
    gatherMarks(root, [], found);
    const kept = await siteIcons();
    for (const mark of found) mark.icon = kept[hostOf(mark.url)] || '';
    return found;
  } catch {
    return [];
  }
}

function gatherMarks(node, path, found) {
  for (const child of node.children || []) {
    if (child.children) {
      // The roots (Bookmarks Toolbar, Bookmarks Menu, …) are folders like any other; the one
      // above them has no name, and nameless folders add nothing to a path.
      gatherMarks(child, child.title ? [...path, child.title] : path, found);
    } else if (child.url && NAVIGABLE.test(child.url)) {
      found.push({
        // Left as it is, even when empty: the panel knows what to show in place of a blank.
        title: child.title || '',
        url: child.url,
        folder: path.join(' / '),
      });
    }
  }
}

// ---- Tabs -------------------------------------------------------------------------------------

// Every tab open anywhere, for ;tabs, with the ones in this window marked so they can be kept
// together. Reading a tab's title and address is what the tabs permission is for.
async function openTabs() {
  try {
    const here = await browser.windows.getCurrent();
    const found = await browser.tabs.query({});
    const kept = await siteIcons();
    return found.map((tab) => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || tab.url || 'Untitled',
      url: tab.url || '',
      active: !!tab.active,
      here: tab.windowId === here.id,
      icon: tab.favIconUrl || kept[hostOf(tab.url || '')] || '',
    }));
  } catch {
    return [];
  }
}

// A tab in another window is no use without the window it is in coming forward too.
async function focusTab(id, windowId) {
  try {
    await browser.tabs.update(id, { active: true });
    if (windowId !== undefined) await browser.windows.update(windowId, { focused: true });
    return true;
  } catch {
    return false;
  }
}

// A window's tabs in the order its tab strip shows them, which is what ;1 to ;9 and ;d1 to ;dz
// count along. A tab an add-on has hidden is not on the strip, so it is not counted either.
async function stripOf(windowId) {
  return (await browser.tabs.query({ windowId }))
    .filter((tab) => !tab.hidden)
    .sort((a, b) => a.index - b.index);
}

// ;1 to ;9: the tab at that place in the window the bar is in.
async function tabAt(place, sender) {
  if (!sender.tab) return false;
  try {
    const tab = (await stripOf(sender.tab.windowId))[place - 1];
    return tab ? focusTab(tab.id) : false;
  } catch {
    return false;
  }
}

// The tabs in the bar's window, numbered for the list of commands, so that nobody has to count
// along the tab strip to know which number a tab is.
async function numberedTabs(sender) {
  if (!sender.tab) return [];
  try {
    const kept = await siteIcons();
    return (await stripOf(sender.tab.windowId)).map((tab) => ({
      title: tab.title || tab.url || 'Untitled',
      url: tab.url || '',
      active: tab.id === sender.tab.id,
      unloaded: !!tab.discarded || unloading.has(tab.id),
      icon: tab.favIconUrl || kept[hostOf(tab.url || '')] || '',
    }));
  } catch {
    return [];
  }
}

// The tabs used most recently, newest first and across every window, for ;last to go back
// along. Kept in session storage for the same reason as the bar's switch: this script is
// stopped when nothing is happening, and a list held only here would be forgotten with it.
const RECENT_TABS = 'recentTabs';
const MAX_RECENT = 30;
let recentWrites = Promise.resolve(); // one at a time, or two at once would lose one of them

async function recentTabs() {
  try {
    const kept = await browser.storage.session.get(RECENT_TABS);
    return kept[RECENT_TABS] || [];
  } catch {
    return []; // no session storage here: ;last falls back on what Firefox knows (see lastTab)
  }
}

function used(tabId) {
  recentWrites = recentWrites.then(async () => {
    const recent = [tabId, ...(await recentTabs()).filter((id) => id !== tabId)];
    try {
      await browser.storage.session.set({ [RECENT_TABS]: recent.slice(0, MAX_RECENT) });
    } catch {
      /* nowhere to keep it */
    }
  });
  return recentWrites;
}

browser.tabs.onActivated.addListener(({ tabId }) => used(tabId));
// Going to another window goes to the tab that is up in it, without any tab being switched to.
browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return; // Firefox itself lost the focus
  try {
    const [tab] = await browser.tabs.query({ active: true, windowId });
    if (tab) used(tab.id);
  } catch {
    /* the window went as it came */
  }
});

// ;last: back to the tab used before this one, in whichever window it is. Doing it again comes
// straight back, because going there made this one the tab used before.
async function lastTab(sender) {
  const here = sender.tab && sender.tab.id;
  await recentWrites;
  for (const id of await recentTabs()) {
    if (id === here) continue;
    try {
      const tab = await browser.tabs.get(id);
      return focusTab(tab.id, tab.windowId);
    } catch {
      /* closed since: the one used before it, then */
    }
  }
  // Nothing kept yet, as just after Firefox starts: the tab in this window that was left last.
  if (!sender.tab) return false;
  try {
    const others = (await browser.tabs.query({ windowId: sender.tab.windowId }))
      .filter((tab) => !tab.active && !tab.hidden)
      .sort((a, b) => b.lastAccessed - a.lastAccessed);
    return others.length ? focusTab(others[0].id) : false;
  } catch {
    return false;
  }
}

// A page cannot open a tab behind itself. Next to the one that asked, not at the far end, and
// left in the background so that Shift+Enter keeps you where you are; ;github asks for the front.
async function newTab(url, sender, front) {
  try {
    await browser.tabs.create({
      url,
      active: !!front,
      ...(sender.tab ? { index: sender.tab.index + 1, openerTabId: sender.tab.id } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

// One switch for the whole browser, not one per page. Every frame of every tab is told, the
// one it was pressed in included: it has already done it and doing it again changes nothing,
// while the frames beside it in the same page have not heard at all, and the bar is in only
// one of them.
async function spreadBar(on) {
  try {
    for (const tab of await browser.tabs.query({})) {
      tell(tab.id, on ? 'bar-on' : 'bar-off');
    }
  } catch {
    /* no tabs to tell */
  }
}

// ---- Unloading tabs ---------------------------------------------------------------------------

// ;d0 to ;dz free what a tab holds, as Firefox's own right-click → Unload Tab does: tabs.discard()
// is the call that menu item makes. What the call leaves out is the fade. Firefox greys the icon
// of a tab it unloads itself by a rule in tabs.css that wants the tab both pending and discarded,
// and a discard an add-on asks for never marks it discarded. So the fade is drawn into the tab's
// icon here instead, from the same rule: grayscale(100%), with invert() under a dark theme, and
// opacity 0.5.
const NOTHING_LOADED = new Set(['about:newtab', 'about:home', 'about:blank']);
// Long enough that the steps are small. Firefox puts a new icon on a tab only about every 120 ms
// (see playFade), so the fade is as smooth as it is long: three seconds is some twenty-five steps.
const FADE_TIME = 3000; // ms
// About how long an icon takes to reach the tab once it is sent, so that each frame can be drawn
// for the moment it will be seen rather than the moment it was sent.
const FADE_LAG = 120; // ms
const LAND_WAIT = 500; // ms a frame is given to reach the tab before the next is sent regardless
const FADED_OPACITY = 0.5;
const ICON_PX = 32; // the tab strip draws icons at 16px, so twice that is plenty
// Setting an icon takes Firefox a moment, and none of that survives the tab being unloaded, so
// the last frame is waited for before the tab goes.
const FADE_POLL = 100; // ms
const FADE_LANDS = 2000; // ms the last frame is given to reach the tab
const FADE_SLACK = 3; // in 0-255 steps: Firefox draws the icon again on its way to the tab
const unloading = new Set(); // tabs on their way out, mid-fade

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ;d0 is the tab the bar is in, and ;d1 to ;dz the tab at that place in its window (content.js
// turns the key into the place: a is the tenth). The answer comes straight away rather than
// after the fade: false for no such tab, and 'idle' for one with nothing loaded to free.
async function unloadAt(place, sender) {
  if (!sender.tab) return false;
  let tab;
  try {
    tab = place
      ? (await stripOf(sender.tab.windowId))[place - 1]
      : await browser.tabs.get(sender.tab.id);
  } catch {
    return false;
  }
  if (!tab) return false;
  if (tab.discarded || NOTHING_LOADED.has(tab.url)) return 'idle';
  unload(tab);
  return true;
}

// Away from the tab first if it is the one in front, as the menu item does, then the fade, and
// only then the unloading itself.
async function unload(tab) {
  if (unloading.has(tab.id)) return;
  unloading.add(tab.id);
  try {
    const icon = tab.favIconUrl;
    const draw = await fader(icon).catch(() => null);
    if (tab.active) await switchAwayFrom(tab);
    if (draw && (await playFade(tab.id, draw))) await waitForFade(tab.id, icon);
    await browser.tabs.discard(tab.id);
    // Firefox will not unload a tab that has been gone back to, has a dialog up, or asks before
    // it is left. Left grey, one of those would look unloaded when it is not, so it gets its own
    // icon back.
    const after = await browser.tabs.get(tab.id).catch(() => null);
    if (draw && after && !after.discarded) await showIcon(tab.id, icon);
  } catch {
    /* the tab was closed along the way */
  } finally {
    unloading.delete(tab.id);
  }
}

// Selecting an unloaded tab loads it again, so this goes to the next tab along that is still
// loaded, round from the end to the start, and opens a new one rather than wake one up.
async function switchAwayFrom(tab) {
  const strip = await stripOf(tab.windowId);
  const at = strip.findIndex((t) => t.id === tab.id);
  for (let step = 1; step < strip.length; step++) {
    const next = strip[(at + step) % strip.length];
    // One mid-fade is on its way out too, and being selected would keep it from going.
    if (next.discarded || unloading.has(next.id)) continue;
    await browser.tabs.update(next.id, { active: true });
    return;
  }
  await browser.tabs.create({ windowId: tab.windowId });
}

// What draws the fade: given how far through it is, the tab's icon at that point, from the icon
// as it is to the icon Firefox leaves an unloaded tab with. Only an icon Firefox already holds as
// data: is used, so nothing is fetched from anywhere, as with the icons ;marks and ;tabs show; a
// tab with any other kind unloads without fading.
async function fader(url) {
  if (!url || !url.startsWith('data:')) return null;
  const image = await decodeIcon(url);
  const wide = image.width || ICON_PX;
  const high = image.height || ICON_PX;
  const scale = Math.min(1, ICON_PX / Math.max(wide, high));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(wide * scale));
  canvas.height = Math.max(1, Math.round(high * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Firefox picks the dark version by the theme, which this page's colour scheme follows too.
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  return (progress) => fadeFrame(ctx, source, progress, dark);
}

async function decodeIcon(url) {
  const blob = await (await fetch(url)).blob();
  try {
    return await createImageBitmap(blob);
  } catch {
    // An SVG icon often has no size of its own, which createImageBitmap refuses. An <img> that
    // is given one draws it all the same.
    return new Promise((resolve, reject) => {
      const image = new Image(ICON_PX, ICON_PX);
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  }
}

// One frame of `filter: grayscale(p) [invert(p)]; opacity` at p of the way through. grayscale(p)
// is saturate(1 - p), a colour matrix over channels that are not premultiplied, which is how
// getImageData hands them over.
function fadeFrame(ctx, source, progress, dark) {
  const frame = ctx.createImageData(source.width, source.height);
  const from = source.data;
  const to = frame.data;
  const s = 1 - progress;
  for (let i = 0; i < from.length; i += 4) {
    const r = from[i];
    const g = from[i + 1];
    const b = from[i + 2];
    let nr = (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b;
    let ng = (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b;
    let nb = (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b;
    if (dark) {
      // invert(p) takes each colour p of the way to its opposite, and leaves the alpha alone.
      nr += progress * (255 - 2 * nr);
      ng += progress * (255 - 2 * ng);
      nb += progress * (255 - 2 * nb);
    }
    to[i] = channel(nr);
    to[i + 1] = channel(ng);
    to[i + 2] = channel(nb);
    to[i + 3] = from[i + 3] * (1 - (1 - FADED_OPACITY) * progress);
  }
  ctx.putImageData(frame, 0, 0);
  return ctx.canvas.toDataURL('image/png');
}

function channel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// The tab's own copy of content.js puts the icon on the page, the way a page sets its own.
async function showIcon(tabId, href) {
  try {
    await browser.tabs.sendMessage(tabId, { favicon: href }, { frameId: TOP_FRAME });
    return true;
  } catch {
    return false; // no UOKey in that tab: one of Firefox's own pages, where it cannot run
  }
}

// A tab's icon cannot be animated: Firefox draws only the first moment of an animated SVG on a
// tab, and turns every other kind into a still picture before it gets there. So the fade is a run
// of icons, and Firefox is slow to take them. It gathers a page's icon changes for 100 ms before
// loading the newest, and drops one still loading when the next arrives, so icons sent on a
// timer either get lost or keep it waiting. Each frame is sent instead the moment the one before
// it is on the tab, drawn for when it will be seen: as many steps as Firefox can show, evenly,
// however busy it is.
async function playFade(tabId, draw) {
  const started = Date.now();
  for (;;) {
    const progress = Math.min(1, (Date.now() - started + FADE_LAG) / FADE_TIME);
    const landed = progress < 1 ? iconLands(tabId) : null;
    if (!(await showIcon(tabId, draw(progress)))) return false;
    if (!landed) return true; // the last frame, which waitForFade sees onto the tab
    await landed;
  }
}

// Firefox says when a tab's icon changes, which is when a frame has landed.
const landing = new Map(); // tab → what to call when the frame on its way there lands

browser.tabs.onUpdated.addListener((id, change) => {
  if (change.favIconUrl && landing.has(id)) landing.get(id)();
});

function iconLands(tabId) {
  return new Promise((resolve) => {
    const landed = () => {
      clearTimeout(timer);
      landing.delete(tabId);
      resolve();
    };
    const timer = setTimeout(landed, LAND_WAIT);
    landing.set(tabId, landed);
  });
}

// Until the last frame is on the tab, so that unloading does not throw the fade away.
async function waitForFade(tabId, before) {
  const until = Date.now() + FADE_LANDS;
  while (Date.now() < until) {
    await sleep(FADE_POLL);
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (!tab) return false;
    if (tab.favIconUrl !== before && (await isFaded(tab.favIconUrl))) return true;
  }
  return false;
}

// Firefox draws every icon again before it puts it on the tab, so favIconUrl never comes back as
// the frame that was sent and cannot be compared with it. The pixels can: the fade has landed
// when the tab shows an icon with no colour left and at most half its alpha, which the last
// frame is and no frame before it.
async function isFaded(url) {
  if (!url || !url.startsWith('data:')) return false;
  try {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const most = Math.round(255 * FADED_OPACITY) + FADE_SLACK;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      if (data[i + 3] > most) return false;
      const spread = Math.max(data[i], data[i + 1], data[i + 2])
        - Math.min(data[i], data[i + 1], data[i + 2]);
      if (spread > FADE_SLACK) return false;
    }
    return true;
  } catch {
    return false;
  }
}
