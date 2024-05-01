---
title:  Apple MLX
description: Using LibreChat with Apple MLX
weight: -6
---
## MLX
Use [MLX](https://ml-explore.github.io/mlx/build/html/index.html) for

* Running large language models on local Apple Silicon hardware (M1, M2, M3) ARM with unified CPU/GPU memory)


### 1. Install MLX on MacOS
#### Mac MX series only
MLX supports GPU acceleration on Apple Metal backend via `mlx-lm` Python package. Follow Instructions at [Install `mlx-lm` package](https://github.com/ml-explore/mlx-examples/tree/main/llms)


### 2. Load Models with MLX
MLX supports common HuggingFace models directly, but it's recommended to use converted and tested quantized models (depending on your hardware capability) provided by the [mlx-community](https://huggingface.co/mlx-community).

Follow Instructions at [Install `mlx-lm` package](https://github.com/ml-explore/mlx-examples/tree/main/llms)

1. Browse the available models  [HuggingFace](https://huggingface.co/models?search=mlx-community)
2. Copy the text from the model page `<author>/<model_id>` (ex: `mlx-community/Meta-Llama-3-8B-Instruct-4bit`)
3. Check model size. Models that can run in CPU/GPU unified memory perform the best.
4. Follow the instructions to launch the model server [Run OpenAI Compatible Server Locally](https://github.com/ml-explore/mlx-examples/blob/main/llms/mlx_lm/SERVER.md)

```mlx_lm.server --model <author>/<model_id>```

### 3. Configure LibreChat
Use `librechat.yaml` [Configuration file (guide here)](./ai_endpoints.md) to add MLX as a separate endpoint, an example with Llama-3 is provided.