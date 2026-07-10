# LibreChat with Unsloth and RAG API

This setup runs LibreChat against an OpenAI-compatible Unsloth endpoint and the bundled LibreChat RAG API with local Hugging Face embeddings.

## Files

- `librechat.yaml` defines the `Unsloth` custom endpoint at `http://localhost:8888/v1`.
- `.env` disables public registration, enables email/password login, sets local secrets, and configures RAG embeddings.
- `docker-compose.override.yml` mounts `librechat.yaml` and switches `rag_api` to the full RAG image with local embedding support.

## Required Edits

Before starting the stack, set these values in `.env`:

```bash
UNSLOTH_API_KEY=sk-unsloth-...
UNSLOTH_MODEL=Qwen3.5-4B-MTP-GGUF
```

The configured base URL is `http://localhost:8888/v1`, derived from the Unsloth API base URL `http://localhost:8888`.

## Start

```bash
docker compose config
docker compose up -d
```

LibreChat will be available at:

```text
http://localhost:3080
```

## Initial User

Registration is disabled with:

```bash
ALLOW_REGISTRATION=false
```

Create the first user inside the API container:

```bash
docker compose exec api npm run create-user
```

Alternatively, temporarily set `ALLOW_REGISTRATION=true`, start LibreChat, create the first account in the UI, then set it back to `false` and restart:

```bash
docker compose restart api
```

## Verification

1. Confirm the stack is valid:
   ```bash
   docker compose config
   ```
2. Start all services:
   ```bash
   docker compose up -d
   ```
3. Log in with the seeded user.
4. Select the `Unsloth` endpoint and send a test message.
5. Upload a document and verify RAG/file citations work.

The first RAG request may take longer while `BAAI/bge-small-en-v1.5` downloads into the `rag_hf_cache` Docker volume.
