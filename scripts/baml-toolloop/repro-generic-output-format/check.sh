#!/usr/bin/env bash
# Deterministic — every generic prompt-rendering path panics.
cd "$(dirname "$0")"
for e in 'Pick$parse<Weather>("{\"city\":\"Boston\"}")' \
         'Pick$render_prompt<Weather>("hi")' \
         'Pick$build_request<Weather>("hi")' \
         'Pick$build_request_stream<Weather>("hi")' \
         'PickConcrete$build_request("hi")'; do
  printf '%-46s -> ' "${e:0:46}"
  if baml run -e "$e" 2>&1 | grep -q panicked; then echo "PANIC output_format.rs:608"; else echo "ok"; fi
done
