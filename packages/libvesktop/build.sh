#!/bin/sh
set -e

# Builds libvesktop for x64 and arm64 using cargo-zigbuild for cross
# compilation and an old glibc floor (2.17, RHEL7/Debian8-era) for maximum
# runtime compatibility, matching the previous C++/node-gyp build's Debian 11
# Docker-based approach (this approach doesn't require a container).
#
# Requires: zig,
# cargo-zigbuild (`cargo install cargo-zigbuild`), and the
# aarch64-unknown-linux-gnu Rust target (`rustup target add
# aarch64-unknown-linux-gnu`).

GLIBC_FLOOR=2.17
TARGET_DIR=$(cargo metadata --no-deps --format-version 1 | node -pe 'JSON.parse(require("fs").readFileSync(0)).target_directory')

echo "=== Building x64 (glibc >= ${GLIBC_FLOOR}) ==="
cargo zigbuild --release --lib --target "x86_64-unknown-linux-gnu.${GLIBC_FLOOR}"
cp "${TARGET_DIR}/x86_64-unknown-linux-gnu/release/liblibvesktop.so" prebuilds/vesktop-x64.node

echo "=== Building arm64 (glibc >= ${GLIBC_FLOOR}) ==="
cargo zigbuild --release --lib --target "aarch64-unknown-linux-gnu.${GLIBC_FLOOR}"
cp "${TARGET_DIR}/aarch64-unknown-linux-gnu/release/liblibvesktop.so" prebuilds/vesktop-arm64.node

echo "=== Regenerating index.d.ts ==="
pnpm exec napi build --no-js --dts index.d.ts
