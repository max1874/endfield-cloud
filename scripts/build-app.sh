#!/bin/bash
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
# Build the actual application; no check, lint, or test suite is run here.
cargo build --jobs 4
app_dir="$project_dir/dist/Endfield Cloud Prototype.app"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources"
cp target/debug/endfield-cloud-prototype "$app_dir/Contents/MacOS/endfield-cloud-prototype"
cp icons/icon.icns "$app_dir/Contents/Resources/icon.icns"
cat > "$app_dir/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>endfield-cloud-prototype</string>
  <key>CFBundleIdentifier</key><string>local.endfield.cloud.prototype</string>
  <key>CFBundleName</key><string>Endfield Cloud Prototype</string>
  <key>CFBundleDisplayName</key><string>云终末地原型</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
codesign --force --sign - "$app_dir"
printf 'Built: %s\n' "$app_dir"
