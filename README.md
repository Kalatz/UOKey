# UOKey

A Firefox extension that lets you click things with the keyboard instead of the mouse.

Press **Ctrl+Shift+F**. A small search bar opens at the bottom of the page. Type part of the text
of a link, button or field, for example `searc` for Amazon's "Search Amazon" box or `sharp` for its
"Start looking sharp" card. Every match is highlighted, and **Enter** clicks the orange one. If the
match is a text field, Enter puts the cursor in it instead so you can type.

| Keys | What they do |
| --- | --- |
| Ctrl+Shift+F | open the bar (press again to close it) |
| Enter | click the orange match, or start typing in it if it is a field |
| Tab or ↓ | next match |
| Shift+Tab or ↑ | previous match |
| Esc | close the bar and go back to where you were |

It searches the visible text of links, buttons and anything with a pointer (hand) cursor. It also
searches field placeholders, labels, tooltips and image descriptions (alt text). Case and accents
don't matter, so `αναζητηση` finds `Αναζήτηση`.

If Firefox's address bar has the keyboard when you press the shortcut, the bar says **Press F6 to
type here**: Firefox doesn't let a page take the keyboard from its own toolbar, and F6 moves it to
the page.

To use a different shortcut, open `about:addons`, click the ⚙ (gear) button, choose **Manage
Extension Shortcuts** and change it next to UOKey.

## Installing it for testing

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. Reload the tabs you want to use it in.

After you edit the code, click **Reload** next to UOKey on that page, then reload the tab.

Firefox removes temporary add-ons when it restarts. To keep UOKey installed, Mozilla has to sign
it. Signing is free and the extension can stay private:

1. Zip the contents of this folder, with `manifest.json` at the top level of the zip.
2. Upload the zip at <https://addons.mozilla.org/developers/addon/submit/distribution> and choose
   **On your own**.
3. Download the signed `.xpi` file and open it in Firefox.

## Limitations

- Firefox doesn't let extensions run on its own pages: `about:` pages, addons.mozilla.org, the PDF
  viewer and Reader View.
- Links inside embedded frames (iframes) aren't searched.
- Text that is part of a picture can only be found if the picture has alt text.
