/*
 * UOKey cannot run on a page until Firefox has been told it may. When it hasn't been, the
 * content script never starts, so there is nothing on the page able to say why nothing happens.
 * This page is that surface: it says which way it stands and asks for the permission.
 */
(() => {
  'use strict';

  const EVERYWHERE = { origins: ['<all_urls>'] };
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
})();
