#!/usr/bin/env bash
# Reproduces every observation recorded in baml_src/ns_spike/claims.baml.
#
# Each block prints the command and its output so a reader can check a claim's
# `observed` field against the toolchain in front of them rather than trusting
# the file. Read-only except for `baml generate`, which rewrites baml_ts/.
#
#   ./scripts/baml-spike/probe.sh            # run every probe
#   ./scripts/baml-spike/probe.sh C05        # run one probe by claim id

set -uo pipefail
export PATH="${BAML_HOME:-$HOME/.baml}/bin:$PATH"
cd "$(dirname "$0")/../.." || exit 1

only="${1:-}"

probe() {
  local id="$1" desc="$2"
  shift 2
  [ -n "$only" ] && [ "$only" != "$id" ] && return 0
  printf '\n=== %s — %s ===\n$ %s\n' "$id" "$desc" "$*"
  "$@" 2>&1 | head -25
}

printf '### environment ###\n'
printf 'baml binary : %s\n' "$(command -v baml || echo 'NOT FOUND')"
baml --version 2>&1

probe C03 "CLI surface: is the binary 'baml' with a 'generate' verb?" \
  baml --help

probe C10 "v0 and v1 release lines coexist on disk" \
  ls "${BAML_HOME:-$HOME/.baml}"

probe C10b "active toolchain channel and version" \
  baml toolchain list

probe BRIDGE "the 'baml bridge' command from the setup instructions" \
  baml bridge --help

probe C02 "generator is declared in baml.toml, not in a .baml file" \
  cat baml.toml

probe C01 "TypeScript host package name and generator wiring" \
  baml describe typescript

probe C05 "ClientRegistry — the v0 runtime provider override" \
  baml describe ClientRegistry

probe C06 "TypeBuilder — the v0 runtime schema extension" \
  baml describe TypeBuilder

probe C07 "Collector — the v0 usage reporter" \
  baml describe Collector

probe C14 "runtime client options: model, api_key, base_url" \
  baml describe baml.llm.PrimitiveClientOptions

probe C13 "per-provider option classes in the llm namespace" \
  baml describe baml.llm

probe C09 "a function need not be an LLM call" \
  cat baml_src/main.baml

probe C09b "…and it runs with no API key configured" \
  baml run main

probe C16 "codegen with no node_modules present" \
  baml generate

probe C04 "generated export shape" \
  head -30 baml_ts/baml_sdk/index.ts

probe SPIKE "the spike compiles and its offline tests pass" \
  baml test

probe REPORT "the claim roll-up" \
  baml run -e 'root.spike.report()'

printf '\n### done ###\n'
