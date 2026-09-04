#!/usr/bin/env python3
"""Insert a NeuronPool custom-endpoint example after the Groq block."""

from pathlib import Path

PATH = Path("librechat.example.yaml")
text = PATH.read_text()
if "NeuronPool" in text:
    print("NeuronPool already present")
    raise SystemExit(0)

anchor = """      modelDisplayLabel: 'groq'

    # Mistral AI Example
"""
insert = """      modelDisplayLabel: 'groq'

    # NeuronPool Example
    # OpenAI-compatible social compute (pool machines + public buyers).
    # Mint a key at https://neuronpool.damnknee.workers.dev/dashboard
    # Keep NEURONPOOL_API_KEY in the environment — never inline the key.
    - name: 'NeuronPool'
      apiKey: '${NEURONPOOL_API_KEY}'
      baseURL: 'https://neuronpool.damnknee.workers.dev/v1'
      models:
        default:
          - 'gpt-oss-20b'
          - 'llama-3.1-8b-instruct'
          - 'qwen2.5-7b-instruct'
          - 'gemma-3-12b-it'
          - 'qwen3-30b-a3b'
          - 'llama-3.2-1b-instruct'
          - 'neuronpool-tiny-chat'
        fetch: true
      titleConvo: true
      titleModel: 'gpt-oss-20b'
      modelDisplayLabel: 'NeuronPool'
      addParams:
        stream: true

    # Mistral AI Example
"""
if anchor not in text:
    raise SystemExit("groq/mistral anchor not found in librechat.example.yaml")
PATH.write_text(text.replace(anchor, insert, 1))
print("inserted NeuronPool example")
