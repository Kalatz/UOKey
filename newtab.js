/*
 * UOKey's own new tab page. Firefox lets no extension run on about:newtab or about:home, so the
 * only way for the bar to work on the page a tab opens at is for UOKey to be that page. Nothing
 * here leaves the browser: the sites and bookmarks are read through background.js and drawn here.
 */
(() => {
  'use strict';

  const ask = (message) => browser.runtime.sendMessage(message).catch(() => null);

  function fill(where, items, empty) {
    const box = document.getElementById(where);
    box.textContent = '';
    if (!items || !items.length) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = empty;
      box.append(note);
      return;
    }
    for (const item of items) {
      const link = document.createElement('a');
      link.className = 'tile';
      link.href = item.url;
      link.title = item.url;
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = (item.title || item.url).replace(/^\W+/, '').charAt(0) || '?';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = item.title || item.url;
      link.append(mark, name);
      box.append(link);
    }
  }

  ask('get-sites').then((sites) => fill('sites', sites, 'Nothing yet.'));
  ask('get-places').then((places) => {
    fill('marks', places && places.bookmarks, 'Nothing on your bookmarks toolbar.');
  });

  // The home page is claimed in the manifest, because browserSettings.homepageOverride is a
  // read-only setting and no extension can change it from code. Firefox asks the user about the
  // claim itself and they can undo it, so all this does is say which way it went.
  const state = document.getElementById('homeState');
  ask('is-home').then((isHome) => {
    state.textContent = isHome
      ? 'Your home button opens this page too.'
      : 'Your home button still opens Firefox Home, where the bar cannot run. '
        + 'Settings → Home → Homepage and new windows can point it here.';
  });
})();
