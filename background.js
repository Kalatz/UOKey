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
browser.runtime.onMessage.addListener((message) => {
  if (message === 'get-shortcut') return currentShortcut();
  if (message === 'get-places') return places();
  if (message === 'get-marks') return allBookmarks();
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


// ---- What !marks needs ----------------------------------------------------------------------

// Every bookmark there is, for !marks, each with the folder it sits in so the panel can group
// them the way they are kept. Walked rather than searched, because a flat search knows only a
// parentId and the folder's name is what is worth showing.
async function allBookmarks() {
  try {
    const [root] = await browser.bookmarks.getTree();
    const found = [];
    gatherMarks(root, [], found);
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
        title: child.title || child.url,
        url: child.url,
        folder: path.join(' / '),
      });
    }
  }
}
