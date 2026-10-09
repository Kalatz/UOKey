/*
 * UOKey cannot run on a page until Firefox has been told it may. When it hasn't been, the
 * content script never starts, so there is nothing on the page able to say why nothing happens.
 * This page is that surface: it says which way it stands and asks for the permission.
 *
 * It also has the !fast switch, for anyone who looks for settings here rather than in the bar.
 */
(() => {
  'use strict';

  const EVERYWHERE = { origins: ['<all_urls>'] };
  const FAST_STORE = 'fastCommands'; // the same place content.js keeps !fast
  const state = document.getElementById('state');
  const grant = document.getElementById('grant');
  const fast = document.getElementById('fast');

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

  browser.storage.local.get(FAST_STORE)
    .then((kept) => { fast.checked = kept[FAST_STORE] === true; })
    .catch(() => { fast.disabled = true; }); // storage is off: there is nowhere to keep it
  fast.addEventListener('change', () => {
    browser.storage.local.set({ [FAST_STORE]: fast.checked }).catch(() => { /* see above */ });
  });
  // Typing !fast in the bar while this page is open turns the box with it.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && FAST_STORE in changes) fast.checked = changes[FAST_STORE].newValue === true;
  });
})();
