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

async function tell(tabId, message) {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    // No content script on this page: Firefox's own pages (about:, the add-ons site, …).
  }
}

browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-finder') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) await tell(tab.id, 'toggle-finder');
});

// A shortcut written with a letter only reaches the listener above when the keyboard types that
// Latin letter, so with a Greek layout (or Russian, Hebrew, …) it never runs. content.js watches
// for the keys itself as well, and asks here which ones they are.
// Whether the bar is meant to be up. Ctrl+Space is a switch, and a switch that only held for
// the page it was pressed on would have to be pressed again on every page. Kept here in memory
// rather than on disk, so it lasts as long as Firefox is running and no longer.
let barWanted = false;

browser.runtime.onMessage.addListener((message, sender) => {
  if (message === 'get-shortcut') return currentShortcut();
  if (message === 'bar-state') return Promise.resolve(barWanted);
  if (message && message.bar !== undefined) {
    barWanted = !!message.bar;
    spreadBar(barWanted, sender);
    return Promise.resolve(barWanted);
  }
  if (message === 'get-marks') return allBookmarks();
  if (message === 'get-tabs') return openTabs();
  if (message && message.tab !== undefined) return focusTab(message.tab, message.window);
  if (message && message.newTab) return newTab(message.newTab, sender);
  return undefined;
});

// Addresses a page can actually be sent to: not javascript: bookmarklets or place: queries.
const NAVIGABLE = /^(https?|ftp|file):/i;

// ---- Favicons ---------------------------------------------------------------------------------

// The icons are never fetched from anywhere. Firefox hands one over whenever a tab settles on a
// page, and those are kept, so !marks and !tabs can show the icon of a site you have been to
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

// Every bookmark there is, for !marks, each with the folder it sits in so the panel can group
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

// Every tab open anywhere, for !tabs, with the ones in this window marked so they can be kept
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

// A page cannot open a tab behind itself. Next to the one that asked, not at the far end, and
// left in the background so that Shift+Enter keeps you where you are.
async function newTab(url, sender) {
  try {
    await browser.tabs.create({
      url,
      active: false,
      ...(sender.tab ? { index: sender.tab.index + 1, openerTabId: sender.tab.id } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

// One switch for the whole browser, not one per page. The tab it was pressed in has already
// done it; the rest are told so they match rather than each keeping its own idea.
async function spreadBar(on, sender) {
  const from = sender && sender.tab ? sender.tab.id : -1;
  try {
    for (const tab of await browser.tabs.query({})) {
      if (tab.id !== from) tell(tab.id, on ? 'bar-on' : 'bar-off');
    }
  } catch {
    /* no tabs to tell */
  }
}
