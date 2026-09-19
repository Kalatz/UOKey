// Firefox runs this when the UOKey shortcut is pressed (Ctrl+Shift+F unless changed in
// about:addons → ⚙ → Manage Extension Shortcuts). The search bar lives in content.js, so pass
// the request on to the page in the current tab.
browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-finder') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await browser.tabs.sendMessage(tab.id, 'toggle-finder');
  } catch {
    // No content script on this page: Firefox's own pages (about:, the add-ons site, …).
  }
});
