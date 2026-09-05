# Historically this Dockerfile pinned an old Debian base (debian:11) plus
# g++-aarch64-linux-gnu to produce binaries compatible with old glibc
# versions on both host architectures, for the C++/node-gyp build.
#
# The Rust/napi-rs port replaces that with `cargo zigbuild`
# (https://github.com/rust-cross/cargo-zigbuild), which uses the Zig
# compiler's bundled libc stubs to target an explicit old glibc floor
# (currently 2.17, RHEL7/Debian8-era) for both x86_64 and aarch64 directly
# from any host with Rust + Zig installed, no container or cross-toolchain
# package installation needed. See build.sh.
#
# The glibc floor is controlled entirely by the `--target
# x86_64-unknown-linux-gnu.2.17` argument passed to cargo-zigbuild (Zig
# supplies its own libc stubs for the target version), not by whatever
# distro/version this image itself runs. Fedora is used as the base here
# because it packages zig, rustup, and a recent enough nodejs
# directly in its own repos, unlike Debian which needs NodeSource for a
# current Node and has no zig package at all.

FROM fedora:44

RUN dnf install -y --setopt=install_weak_deps=False \
    zig rustup nodejs npm gcc git \
 && dnf clean all

RUN rustup-init -y --default-toolchain stable \
 && . "$HOME/.cargo/env" \
 && rustup target add aarch64-unknown-linux-gnu \
 && cargo install cargo-zigbuild

ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /src
