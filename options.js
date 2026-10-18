/*
 * UOKey cannot run on a page until Firefox has been told it may. When it hasn't been, the
 * content script never starts, so there is nothing on the page able to say why nothing happens.
 * This page is that surface: it says which way it stands and asks for the permission.
 *
 * It also has the settings, ;;hints and ;;fast, for anyone who looks for them here rather
 * than in the bar.
 */
(() => {
  'use strict';

  const EVERYWHERE = { origins: ['<all_urls>'] };
  // The same places content.js keeps them, and whether a box is ticked when nothing is kept yet.
  const SWITCHES = [
    { box: document.getElementById('fast'), store: 'fastCommands', unset: false },
    { box: document.getElementById('hints'), store: 'showHints', unset: true },
  ];
  const state = document.getElementById('state');
  const grant = document.getElementById('grant');

  async function show() {
    let allowed = false;
    try {
      allowed = await browser.permissions.contains(EVERYWHERE);
    } catch {
      /* asking failed: treat it as not allowed and offer the button */
    }
    state.textContent = allowed
      ? 'Allowed. UOKey works on the pages you visit.'
      : 'Not allowed yet, so UOKey can do nothing on any page.';
    state.classList.toggle('off', !allowed);
    grant.hidden = allowed;
  }

  // Firefox only grants this from a press, which is why it is a button and not done on load.
  grant.addEventListener('click', async () => {
    grant.disabled = true;
    try {
      await browser.permissions.request(EVERYWHERE);
    } catch {
      /* declined, or asked somewhere Firefox will not ask from */
    }
    grant.disabled = false;
    show();
  });

  browser.permissions.onAdded?.addListener(show);
  browser.permissions.onRemoved?.addListener(show);
  show();

  const ticked = (s, value) => (value === undefined ? s.unset : value === true);
  for (const s of SWITCHES) {
    browser.storage.local.get(s.store)
      .then((kept) => { s.box.checked = ticked(s, kept[s.store]); })
      .catch(() => { s.box.disabled = true; }); // storage is off: there is nowhere to keep it
    s.box.addEventListener('change', () => {
      browser.storage.local.set({ [s.store]: s.box.checked }).catch(() => { /* see above */ });
    });
  }
  // Typing ;;fast or ;;hints in the bar while this page is open turns the box with it.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const s of SWITCHES) {
      if (s.store in changes) s.box.checked = ticked(s, changes[s.store].newValue);
    }
  });
})();
