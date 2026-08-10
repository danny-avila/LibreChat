#!/bin/sh

set -eu

BAML_VERSION=0.15.0
RELEASE_BASE="https://github.com/BoundaryML/baml/releases/download/baml-language-${BAML_VERSION}"

usage() {
  printf '%s\n' \
    'Usage: scripts/install-baml-toolchain.sh [--verify] [--archive PATH]' \
    '' \
    'Installs the exactly pinned BAML 0.15.0 toolchain for this host.' \
    'BAML_INSTALL_ROOT and BAML_BIN_DIR may select isolated install locations.'
}

version_of() {
  "$1" --version 2>&1 | sed -n \
    -e 's/^baml toolchain //p' \
    -e 's/^baml-cli //p' | tail -n 1
}

verify_binary() {
  binary=$1
  if [ ! -x "$binary" ]; then
    printf 'BAML executable is missing: %s\n' "$binary" >&2
    return 1
  fi
  found=$(version_of "$binary")
  if [ "$found" != "$BAML_VERSION" ]; then
    printf 'BAML version mismatch: required %s, found %s\n' \
      "$BAML_VERSION" "${found:-<none>}" >&2
    return 1
  fi
}

verify_only=false
archive_path=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verify)
      verify_only=true
      ;;
    --archive)
      shift
      if [ "$#" -eq 0 ]; then
        printf '%s\n' '--archive requires a path' >&2
        exit 2
      fi
      archive_path=$1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$verify_only" = true ]; then
  baml_path=$(command -v baml || true)
  if [ -z "$baml_path" ]; then
    printf '%s\n' 'BAML is not installed or is not on PATH.' >&2
    exit 1
  fi
  verify_binary "$baml_path"
  printf 'BAML toolchain %s verified at %s\n' "$BAML_VERSION" "$baml_path"
  exit 0
fi

system=$(uname -s)
machine=$(uname -m)
case "$machine" in
  arm64|aarch64) architecture=aarch64 ;;
  x86_64|amd64) architecture=x86_64 ;;
  *)
    printf 'Unsupported BAML architecture: %s\n' "$machine" >&2
    exit 1
    ;;
esac

case "$system" in
  Darwin)
    target="${architecture}-apple-darwin"
    ;;
  Linux)
    libc=gnu
    if ldd --version 2>&1 | grep -qi musl; then
      libc=musl
    fi
    target="${architecture}-unknown-linux-${libc}"
    ;;
  *)
    printf 'Unsupported BAML operating system: %s\n' "$system" >&2
    exit 1
    ;;
esac

case "$target" in
  aarch64-apple-darwin)
    expected_sha=8a95e1b60527481f1706848dae530aa6857963fe9499b6d8cc41448d4c29259b
    archive_url="${RELEASE_BASE}/baml-language-0.15.0-aarch64-apple-darwin.tar.gz"
    ;;
  x86_64-apple-darwin)
    expected_sha=ad011e54a873fcf86896ddb0802395f1f368574f3551de22411cc0109d62aa3f
    archive_url="${RELEASE_BASE}/baml-language-0.15.0-x86_64-apple-darwin.tar.gz"
    ;;
  aarch64-unknown-linux-gnu)
    expected_sha=39fcc5e552fbd803185878aec71d4b578da5240360f8b4d7d51a550ed4d7eab5
    archive_url="${RELEASE_BASE}/baml-language-0.15.0-aarch64-unknown-linux-gnu.tar.gz"
    ;;
  aarch64-unknown-linux-musl)
    expected_sha=95a212f11e0c863dcaa651e820dfed17b010d31f4ca56b62e6226940a7fb1b13
    archive_url="${RELEASE_BASE}/baml-language-0.15.0-aarch64-unknown-linux-musl.tar.gz"
    ;;
  x86_64-unknown-linux-gnu)
    expected_sha=2d93245c2e01c946d3225a4af10a7eaee660289cccd8166da46ac884c2283f60
    archive_url="${RELEASE_BASE}/baml-language-0.15.0-x86_64-unknown-linux-gnu.tar.gz"
    ;;
  x86_64-unknown-linux-musl)
    expected_sha=1969d8947b6a19fe61a8cfa7dd6ef7c8e9d41153c11f5e7e50639bec39e2b888
    archive_url="${RELEASE_BASE}/baml-language-0.15.0-x86_64-unknown-linux-musl.tar.gz"
    ;;
esac

archive_name="baml-language-${BAML_VERSION}-${target}.tar.gz"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

if [ -n "$archive_path" ]; then
  if [ ! -f "$archive_path" ]; then
    printf 'BAML archive does not exist: %s\n' "$archive_path" >&2
    exit 1
  fi
  archive=$archive_path
else
  archive="${temporary}/${archive_name}"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$archive_url" -o "$archive"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$archive_url" -O "$archive"
  else
    printf '%s\n' 'curl or wget is required to install BAML.' >&2
    exit 1
  fi
fi

if command -v sha256sum >/dev/null 2>&1; then
  actual_sha=$(sha256sum "$archive" | awk '{print $1}')
else
  actual_sha=$(shasum -a 256 "$archive" | awk '{print $1}')
fi
if [ "$actual_sha" != "$expected_sha" ]; then
  printf 'BAML archive checksum mismatch for %s: expected %s, found %s\n' \
    "$target" "$expected_sha" "$actual_sha" >&2
  exit 1
fi

extracted="${temporary}/extracted"
mkdir -p "$extracted"
tar -xzf "$archive" -C "$extracted"
recorded=$(tr -d '[:space:]' < "${extracted}/VERSION")
if [ "$recorded" != "$BAML_VERSION" ]; then
  printf 'BAML archive version mismatch: required %s, found %s\n' \
    "$BAML_VERSION" "${recorded:-<none>}" >&2
  exit 1
fi
verify_binary "${extracted}/bin/baml-cli"

install_root=${BAML_INSTALL_ROOT:-"${HOME}/.local/share/librechat-baml"}
bin_dir=${BAML_BIN_DIR:-"${HOME}/.local/bin"}
install_dir="${install_root}/${BAML_VERSION}/${target}"

if [ -e "${bin_dir}/baml" ]; then
  verify_binary "${bin_dir}/baml"
  printf 'BAML toolchain %s is already installed at %s\n' "$BAML_VERSION" "${bin_dir}/baml"
  exit 0
fi

if [ -e "$install_dir" ]; then
  verify_binary "${install_dir}/bin/baml-cli"
else
  install_parent=$(dirname "$install_dir")
  mkdir -p "$install_parent"
  staging=$(mktemp -d "${install_parent}/.install-${target}.XXXXXX")
  cp -R "${extracted}/." "$staging/"
  mv "$staging" "$install_dir"
fi

mkdir -p "$bin_dir"
ln -s "${install_dir}/bin/baml-cli" "${bin_dir}/baml"
ln -s "${install_dir}/bin/baml-pack-host" "${bin_dir}/baml-pack-host"
verify_binary "${bin_dir}/baml"

printf 'Installed BAML toolchain %s for %s at %s\n' "$BAML_VERSION" "$target" "$install_dir"
printf 'Add %s to PATH.\n' "$bin_dir"
