# Collections Embedding Utilities

This directory contains utilities for managing embeddings in the Collections tool.

## Scripts

### `generate-missing-embeddings.js`

A standalone script that finds notes without embeddings and generates them using OpenAI's embedding API.

**Usage:**
```bash
# Dry run (see what would be processed)
node generate-missing-embeddings.js --dry-run

# Process up to 50 notes in batches of 5
node generate-missing-embeddings.js --limit=50 --batch-size=5

# Process all missing embeddings (use with caution)
node generate-missing-embeddings.js --limit=1000
```

**Options:**
- `--dry-run`: Show what would be processed without making changes
- `--limit=N`: Maximum number of notes to process (default: 100)
- `--batch-size=N`: Number of notes to process per batch (default: 10)

### `setup-embedding-cron.sh`

Sets up a cron job to run the embedding generation script automatically.

**Usage:**
```bash
# Default: runs every hour at minute 15
./setup-embedding-cron.sh

# Custom schedule (every 30 minutes)
./setup-embedding-cron.sh "*/30 * * * *"

# Daily at 2 AM
./setup-embedding-cron.sh "0 2 * * *"
```

## Environment Variables

Make sure these are set:
- `OPENAI_API_KEY`: Required for embedding generation
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: Database connection

## Monitoring

Logs are written to `../logs/embedding-generation.log` when run via cron.

**View logs:**
```bash
tail -f ../logs/embedding-generation.log
```

**Check cron job:**
```bash
crontab -l
```

## How It Works

1. **Script finds notes without embeddings** by looking for notes that don't have entries in the `note_vectors` table
2. **Processes in batches** to avoid rate limiting and manage memory usage
3. **Generates embeddings** using OpenAI's `text-embedding-3-small` model
4. **Stores embeddings** in PostgreSQL with pgvector format
5. **Logs progress** and provides detailed statistics

## Rate Limiting

The script includes built-in rate limiting:
- Processes notes in small batches (default: 10)
- Waits 1 second between batches
- Configurable batch sizes for different usage patterns

## Error Handling

- Individual embedding failures don't stop the entire process
- Failed notes are logged for manual review
- Database connection errors are handled gracefully
- Script can be safely interrupted (Ctrl+C) and resumed later