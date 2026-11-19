#!/bin/bash
# Build the site for the web into dist/: only the files the site needs (not the
# examples, docs or tools), its modules minified, and every text file also as a
# gzip copy (and a Brotli one when `brotli` is installed) for servers that can
# send them as they are (Caddy `precompressed`, Nginx `gzip_static`). The
# source files stay as they are, readable.
# Usage: tools/build.sh [--deploy]
#   --deploy   also rsync dist/ to $DEPLOY_TARGET (e.g. user@host:/var/www/site/)
# Needs Node.js (npx) to minify; without it the modules are copied unminified.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/dist"
rm -rf "$out" && mkdir -p "$out"
for item in index.html _headers home.config.js homecraft.json world assets engine vendor; do
  [ -e "$root/$item" ] && cp -R "$root/$item" "$out/"
done
find "$out" -name .DS_Store -delete

# Minify every module that isn't minified already (three.js ships .min.js). The
# target is the oldest browsers the import map already needs, so minifying
# never adds syntax they lack; the pinned version keeps the output stable.
if command -v npx >/dev/null; then
  (cd "$out" && find . -name '*.js' ! -name '*.min.js' -print0 |
    xargs -0 npx --yes esbuild@0.25.10 --minify --charset=utf8 --format=esm \
      --target=chrome89,edge89,firefox108,safari16.4,ios16.4 \
      --outdir=. --outbase=. --allow-overwrite --log-level=warning)
else
  echo 'npx not found: modules copied unminified' >&2
fi

# Same input, same output: gzip -n leaves out the name and time, and each copy
# takes its source's mtime, so unchanged files upload as unchanged.
find "$out" -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.json' -o -name '*.svg' \) -size +255c |
while read -r f; do
  gzip -9 -n -c "$f" > "$f.gz"; touch -r "$f" "$f.gz"
  if command -v brotli >/dev/null; then brotli -q 11 -c "$f" > "$f.br"; touch -r "$f" "$f.br"; fi
done
echo "built $out ($(du -sh "$out" | cut -f1))"

if [ "${1:-}" = --deploy ]; then
  : "${DEPLOY_TARGET:?set DEPLOY_TARGET, e.g. user@host:/var/www/site/}"
  rsync -az --delete "$out/" "$DEPLOY_TARGET"
  echo "deployed to $DEPLOY_TARGET"
fi
