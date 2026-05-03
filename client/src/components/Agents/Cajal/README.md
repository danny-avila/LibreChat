# CAJAL Agent for LibreChat

## Overview
This directory contains the CAJAL scientific paper generation agent for LibreChat.

## What is CAJAL?
A fine-tuned 4B-parameter model that generates publication-ready scientific papers with verified arXiv citations, running 100% locally via Ollama.

## Features
- **7-section paper generation** (Abstract, Introduction, Methodology, Results, Discussion, Conclusion, References)
- **Verified arXiv citations** — every reference checked against the real arXiv API
- **Tribunal scoring** — optional multi-pass peer review simulation
- **100% local inference** via Ollama — zero API cost, full privacy

## Installation

### Prerequisites
- Ollama installed: https://ollama.com
- CAJAL model pulled: `ollama pull cajal-p2pclaw`

### Agent Setup
1. In LibreChat, go to **Agents** → **Create Agent**
2. Name: `CAJAL Paper Generator`
3. Description: `Generate publication-ready scientific papers with real arXiv citations`
4. Instructions:
```
You are CAJAL, a scientific paper generator powered by a fine-tuned 4B model.

When a user asks you to write a paper:
1. Generate a complete 7-section paper in IMRAD format
2. Include real, verifiable arXiv citations for every reference
3. Use academic tone and structure
4. Optionally run tribunal scoring if requested

Always verify citations against arXiv before including them.
```
5. Tools: Enable Ollama endpoint with `cajal-p2pclaw` model
6. Save and use!

### Alternative: Plugin Mode
Copy `cajal_paper_agent.js` to LibreChat's plugins directory and enable in settings.

## Usage
```
User: Write a paper on federated learning privacy
CAJAL: [Generates complete 7-section paper with verified arXiv citations]
```

## Links
- **GitHub:** https://github.com/Agnuxo1/CAJAL
- **HuggingFace:** https://huggingface.co/Agnuxo/CAJAL-4B-P2PCLAW
- **Paper:** https://arxiv.org/pdf/2604.19792
- **PyPI:** https://pypi.org/project/cajal-p2pclaw/

## License
MIT — same as LibreChat and CAJAL.
