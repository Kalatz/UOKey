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
browser.runtime.onMessage.addListener((message, sender) => {
  if (message === 'get-shortcut') return currentShortcut();
  if (message === 'get-places') return places();
  if (message === 'get-marks') return allBookmarks();
  if (message === 'get-sites') return topSites();
  if (message === 'is-home') return isHome();
  if (message && message.open) return openUrl(sender, message.open);
  return undefined;
});

// What !short puts in its strip, which the page has no way of reading for itself. An extension
// cannot draw on Firefox's own toolbar, so UOKey draws these in the page instead and does the
// real thing when the key is pressed. None of it is stored or sent anywhere.
const NAVIGABLE = /^(https?|ftp|file):/i; // not javascript: bookmarklets or place: queries

async function places() {
  const [home, bookmarks] = await Promise.all([homepage(), toolbarBookmarks()]);
  return { home, bookmarks };
}

async function homepage() {
  try {
    const setting = await browser.browserSettings.homepageOverride.get({});
    // Firefox allows several home pages separated by |; the first is the one the button opens.
    const first = String(setting.value || '').split('|')[0].trim();
    return NAVIGABLE.test(first) ? first : '';
  } catch {
    return ''; // no permission for it, or it is set to something a page cannot be sent to
  }
}

async function toolbarBookmarks() {
  try {
    const children = await browser.bookmarks.getChildren('toolbar_____');
    // Folders have no url, and a separator is nothing to open.
    return children
      .filter((mark) => mark.url && NAVIGABLE.test(mark.url))
      .map((mark) => ({ title: mark.title || mark.url, url: mark.url }));
  } catch {
    return [];
  }
}

// The shortcut was changed in about:addons: tell the pages that are already open.
browser.commands.onChanged?.addListener(async ({ name }) => {
  if (name !== 'toggle-finder') return;
  const shortcut = await currentShortcut();
  for (const tab of await browser.tabs.query({})) tell(tab.id, { shortcut });
});


// ---- What !marks and UOKey's own new tab page need -------------------------------------------

// Every bookmark there is, for !marks. Folders have no url; a place: query isn't a page.
async function allBookmarks() {
  try {
    const found = await browser.bookmarks.search({});
    return found
      .filter((mark) => mark.url && NAVIGABLE.test(mark.url))
      .map((mark) => ({ title: mark.title || mark.url, url: mark.url }));
  } catch {
    return [];
  }
}

// The sites Firefox would have put on its own new tab page, for the one UOKey puts there instead.
async function topSites() {
  try {
    const sites = await browser.topSites.get({ includeFavicon: false, limit: 12 });
    return sites
      .filter((site) => NAVIGABLE.test(site.url))
      .map((site) => ({ title: site.title || site.url, url: site.url }));
  } catch {
    return [];
  }
}

function ownPage() {
  return browser.runtime.getURL('newtab.html');
}

// browserSettings.homepageOverride is read-only (Firefox declares it so), which is why the home
// page is claimed by chrome_settings_overrides in the manifest instead: Firefox then asks the
// user itself, and they can undo it in Settings. All that is left to do here is read it back.
async function isHome() {
  try {
    const setting = await browser.browserSettings.homepageOverride.get({});
    return String(setting.value || '').split('|')[0].trim() === ownPage();
  } catch {
    return false;
  }
}

// A page cannot send itself to moz-extension:, so UOKey's own page is opened from here.
async function openUrl(sender, url) {
  try {
    if (!sender.tab) return false;
    await browser.tabs.update(sender.tab.id, { url });
    return true;
  } catch {
    return false;
  }
}
