// Firefox runs this when the UOKey shortcut is pressed (Ctrl+Shift+F unless changed in
// about:addons → ⚙ → Manage Extension Shortcuts). The search bar lives in content.js, so pass
// the request on to the page in the current tab.
const DEFAULT_SHORTCUT = 'Ctrl+Shift+F';

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

// Firefox only recognises the shortcut when the keyboard types a Latin letter, so with a Greek
// layout (or Russian, Hebrew, …) the listener above never runs. content.js watches for the keys
// itself as well, and asks here which ones they are.
browser.runtime.onMessage.addListener((message) => {
  if (message === 'get-shortcut') return currentShortcut();
  return undefined;
});

// The shortcut was changed in about:addons: tell the pages that are already open.
browser.commands.onChanged?.addListener(async ({ name }) => {
  if (name !== 'toggle-finder') return;
  const shortcut = await currentShortcut();
  for (const tab of await browser.tabs.query({})) tell(tab.id, { shortcut });
});
