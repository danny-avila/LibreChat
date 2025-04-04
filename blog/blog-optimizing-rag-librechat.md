# Optimizing RAG Performance in LibreChat (Detailed Guide)

**By Henk van Ess**  

This guide walks you through optimizing Retrieval-Augmented Generation (RAG) performance in your LibreChat setup. Always change **only one major setting at a time** and test results carefully.

---

## 1. Optimize Database (vectordb - PostgreSQL/pgvector)

Improving database performance is crucial for RAG speed, especially during indexing and retrieval.

### 1.1. Verify/Create Metadata & Filter Indexes (**CRITICAL**)

Missing indexes for filtering can drastically degrade performance.

#### Connect to the Database:

```bash
docker exec -it vectordb psql -U myuser -d mydatabase
# Enter 'mypassword' (or your secure password)
```

#### Check for existing indexes:

```sql
\di langchain_pg_embedding*
```

You should see:

- `custom_id_idx`
- `idx_cmetadata_file_id_text`
- A vector index like `langchain_pg_embedding_embedding_idx`

If missing, run:

```sql
-- Internal lookup by custom_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS custom_id_idx ON langchain_pg_embedding (custom_id);

-- Filter by file_id inside metadata
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cmetadata_file_id_text ON langchain_pg_embedding ((cmetadata ->> 'file_id'));
```

#### Exit:

```sql
\q
```

---

### 1.2. Verify/Tune Vector Index

The pgvector extension typically creates an index on the `embedding` column.

Check with `\di` again. Look for a `hnsw` or `ivfflat` index type.

> ⚙️ **Advanced**: You can tune index parameters like `lists`, `m`, `ef_search`, and `ef_construction` (see [pgvector README](https://github.com/pgvector/pgvector)).

---

### 1.3. Monitor/Adjust Server Resources

```bash
docker stats vectordb
```

Watch for memory or CPU saturation. PostgreSQL benefits from abundant RAM.

#### Optional: Set resource limits in `docker-compose.override.yml`

```yaml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '1.0'
```

---

### 1.4. Perform Database Maintenance

Run regularly:

```sql
VACUUM (VERBOSE, ANALYZE) langchain_pg_embedding;
```

---

### 1.5. Advanced PostgreSQL Tuning

Consider tuning:

- `shared_buffers`
- `work_mem`
- `maintenance_work_mem`
- `effective_cache_size`

These live in `postgresql.conf` (inside the container). Only touch them if you know what you're doing.

---

## 2. Tune Chunking Strategy (`.env`)

Impacts upload speed and retrieval precision.

### 2.1. Open the main `.env` file:

```bash
nano ~/LibreChat/.env
```

### 2.2. Modify chunk settings:

```env
CHUNK_SIZE=1500
CHUNK_OVERLAP=150
```

Try other combinations like:

- `1000/100`
- `500/50`

Trade-offs:  
- **Larger chunks** = faster processing, lower precision  
- **Smaller chunks** = slower, more precise

### 2.3. Save, exit, and restart:

```bash
docker-compose down
docker-compose up -d --force-recreate
```

---

### 2.4. Delete Old Embeddings

- **Easiest**: Delete files via UI
- **Advanced**: Delete from DB

```sql
DELETE FROM langchain_pg_embedding WHERE cmetadata ->> 'file_id' = 'YOUR_FILE_ID';
```

> 🔁 Safer method: Use a **new test file** for each config test

---

### 2.5. Re-upload & test performance

---

## 3. Optimize Embedding Process

Set provider/model in `.env`.

### Examples:

#### OpenAI:

```env
EMBEDDINGS_PROVIDER=openai
EMBEDDINGS_MODEL=text-embedding-ada-002
```

#### Azure:

```env
EMBEDDINGS_PROVIDER=azure
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=...
AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME=...
```

#### Ollama (local):

```env
EMBEDDINGS_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
EMBEDDINGS_MODEL=nomic-embed-text
```

### Restart and re-upload:

```bash
docker-compose down
docker-compose up -d --force-recreate
```

---

## 4. Tune Retrieval Strategy

How many chunks are retrieved affects both relevance and API limits.

### 4.1. In `.env`:

```env
RAG_API_TOP_K=3
# RAG_USE_FULL_CONTEXT=True
```

- Lower `TOP_K` = safer, faster  
- Higher `TOP_K` = more context, risk of hitting token limits

---

## 5. Monitor LibreChat API Logs

Check for truncation or token overflows.

### 5.1. Run a large query, then:

```bash
docker logs <apiN_container_name> --tail 300
```

Search for:

```text
... [truncated]
```

If present, reduce `TOP_K` or `CHUNK_SIZE`.

---

## 6. Manage Server Load & Isolation

### 6.1. Monitor:

```bash
htop
docker stats
```

### 6.2. Reduce Load (temporarily):

```bash
# Stop unused APIs or admin panels
docker-compose stop api2 api3
sudo systemctl stop lcadmin3.service
```

### 6.3. Upgrade Hardware

- More RAM/CPU
- Use SSD (preferably NVMe)
- GPU boosts embedding (if using local models)

### 6.4. Advanced: Separate Services

You can host `vectordb` and `rag_api` on separate machines for heavy workloads.

---

## Summary

Start with **index optimization**. Then move on to:

1. Chunk tuning (`CHUNK_SIZE`, `CHUNK_OVERLAP`)
2. Retrieval strategy (`RAG_API_TOP_K`)
3. Embedding configuration
4. API log monitoring

Test each change independently. Always monitor API logs and resource usage. If issues persist, consider model/hardware upgrades.

---

