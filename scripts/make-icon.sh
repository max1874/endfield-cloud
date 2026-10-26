#!/bin/bash
# Regenerates icons/icon.png and icons/icon.icns from icons/appstore-artwork.png.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir/icons"
swift "$project_dir/scripts/make-icon.swift" appstore-artwork.png icon.png
iconset="$(mktemp -d)/icon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" icon.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) icon.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns -o icon.icns "$iconset"
rm -rf "$(dirname "$iconset")"
printf 'Built: icons/icon.png icons/icon.icns\n'
