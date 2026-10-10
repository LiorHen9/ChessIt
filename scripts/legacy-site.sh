#!/usr/bin/env bash
# Puts together the "ChessIt moved" notice (legacy-pages/) for one old address.
#   scripts/legacy-site.sh <base> <out-dir>
# <base> is the path the old app lived at: /ChessIt/ on GitHub Pages, / on chessit-6d389.web.app.
# Used by .github/workflows/legacy-pages.yml and .github/workflows/deploy.yml.
set -euo pipefail

base="$1"
out="$2"

rm -rf "$out"
mkdir -p "$out"
cp -r legacy-pages/. "$out/"
cp public/favicon.svg "$out/"
cp -r public/icons public/fonts "$out/"
sed -i "s|__BASE__|$base|g" "$out/404.html" "$out/registerSW.js"

if grep -rq "__BASE__" "$out"; then
  echo "::error::__BASE__ left in $out"
  exit 1
fi
ls -R "$out"
