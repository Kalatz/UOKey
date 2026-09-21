#!/bin/sh
# Builds the zip to upload for signing. Everything the add-on needs and nothing else: the
# manifest has to sit at the top level of the zip, not inside a folder, or Firefox won't read it.
set -e
cd "$(dirname "$0")"

version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[ -n "$version" ] || { echo "no version in manifest.json" >&2; exit 1; }
zip="uokey-$version.zip"

rm -f "$zip"
zip -q -X -r "$zip" \
  manifest.json background.js content.js options.html options.js icons/icon.svg

echo "$zip"
unzip -l "$zip"
