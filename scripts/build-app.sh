#!/bin/bash
# Usage: build-app.sh [--release]
# --release builds the release profile (no dev inbox), manual-install zip,
# signed updater archive and latest.json for GitHub releases.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"
if [ -x "$project_dir/.toolchain/cargo/bin/cargo" ]; then
  export CARGO_HOME="$project_dir/.toolchain/cargo"
  export RUSTUP_HOME="$project_dir/.toolchain/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
elif ! command -v cargo >/dev/null 2>&1 && [ -x /opt/homebrew/opt/rustup/bin/cargo ]; then
  export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
fi
profile=debug
cargo_flags=()
if [ "${1:-}" = "--release" ]; then
  if [ -z "${UPDATE_SIGNING_KEY:-}" ]; then
    echo "Release builds require UPDATE_SIGNING_KEY. Run: key run UPDATE_SIGNING_KEY=ENDFIELD_CLOUD_UPDATE_SIGNING_KEY -- scripts/build-app.sh --release" >&2
    exit 1
  fi
  profile=release
  cargo_flags=(--release)
fi
version="$(sed -n 's/^version = "\(.*\)"$/\1/p' Cargo.toml | head -1)"
# Build the actual application; no check, lint, or test suite is run here.
# The guard keeps an empty array from failing `set -u` in macOS's bash 3.2.
cargo build ${cargo_flags[@]+"${cargo_flags[@]}"} --jobs 4
app_dir="$project_dir/dist/Endfield Cloud.app"
rm -rf "$project_dir/dist/Endfield Cloud Prototype.app"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources"
cp "target/$profile/endfield-cloud-prototype" "$app_dir/Contents/MacOS/endfield-cloud-prototype"
cp icons/icon.icns "$app_dir/Contents/Resources/icon.icns"
# Finder, the Dock and Launchpad show the localized CFBundleDisplayName (云终末地 in
# every language) only while the file name matches the unlocalized one in Info.plist.
for lang in en zh-Hans; do
  mkdir -p "$app_dir/Contents/Resources/$lang.lproj"
  printf 'CFBundleDisplayName = "云终末地";\n' > "$app_dir/Contents/Resources/$lang.lproj/InfoPlist.strings"
done
cat > "$app_dir/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>endfield-cloud-prototype</string>
  <key>CFBundleIdentifier</key><string>local.endfield.cloud.prototype</string>
  <key>CFBundleName</key><string>Endfield Cloud</string>
  <key>CFBundleDisplayName</key><string>Endfield Cloud</string>
  <key>LSHasLocalizedDisplayName</key><true/>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>CFBundleShortVersionString</key><string>$version</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
codesign --force --sign - "$app_dir"
printf 'Built: %s (%s %s)\n' "$app_dir" "$profile" "$version"
if [ "$profile" = release ]; then
  zip_path="$project_dir/dist/endfield-cloud-v$version-macos-arm64.zip"
  rm -f "$zip_path"
  (cd "$project_dir/dist" && ditto -c -k --keepParent "Endfield Cloud.app" "$zip_path")
  printf 'Zip: %s\n' "$zip_path"
  archive_name="endfield-cloud-v$version-macos-arm64.app.tar.gz"
  archive_path="$project_dir/dist/$archive_name"
  # The macOS updater strips exactly one path component before replacing the app.
  COPYFILE_DISABLE=1 tar -czf "$archive_path" -C "$project_dir/dist" "Endfield Cloud.app"
  cargo run --release --jobs 4 --manifest-path scripts/update-signer/Cargo.toml -- sign "$archive_path"
  python3 - "$version" "$archive_path" <<'PYJSON'
import datetime
import json
import pathlib
import sys
version, archive = sys.argv[1], pathlib.Path(sys.argv[2])
manifest = {
    "version": version,
    "notes": "",
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {"darwin-aarch64": {
        "signature": pathlib.Path(str(archive) + ".sig").read_text().strip(),
        "url": f"https://github.com/max1874/endfield-cloud/releases/download/v{version}/{archive.name}",
    }},
}
(archive.parent / "latest.json").write_text(json.dumps(manifest, indent=2) + "\n")
PYJSON
  printf 'Update: %s\nManifest: %s/dist/latest.json\n' "$archive_path" "$project_dir"
fi
