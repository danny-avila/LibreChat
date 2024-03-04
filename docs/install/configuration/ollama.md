---
title: 🦙 Ollama
description: Using LibreChat with Ollama 
weight: -6
---
## Ollama
Use [Ollama](https://ollama.ai/) for

* Running large language models on local hardware
* Hosting multiple models
* Dynamically loading the model upon request

### 1. Install Ollama
#### Mac, Linux, Windows Install
Ollama supports GPU acceleration on Nvidia, AMD, and Apple Metal. Follow Instructions at [Ollama Download](https://ollama.com/download) 

#### Docker Install
Reference docker-compose.override.yml.example for configuration of Ollama in a Docker environment.

Run ```docker exec -it ollama /bin/bash``` to access the Ollama command within the container.

### 2. Load Models in Ollama
1. Browse the available models at [Ollama Library](https://ollama.ai/library)
2. Copy the text from the Tags tab from the library website and paste it into the terminal. It should begin with 'ollama run'
3. Check model size. Models that can run in GPU memory perform the best.
4. Use /bye to exit the terminal

### 3. Configure LibreChat
Use `librechat.yaml` [Configuration file (guide here)](./ai_endpoints.md) to add Ollama as a separate endpoint.