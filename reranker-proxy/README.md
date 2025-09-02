# Custom Reranking Proxy for LibreChat

This directory contains a Jina-compatible reranking proxy that uses local sentence-transformer models instead of external APIs.

## Features

- **Jina API Compatible**: Mimics Jina's `/v1/rerank` endpoint format
- **Local Processing**: No external API calls or rate limits
- **High Quality**: Uses BAAI/bge-reranker-base (state-of-the-art reranking model)
- **Cost Effective**: No per-request charges
- **Fast**: Local inference with optimized batching

## How It Works

1. **Search Results**: LibreChat gets search results from Serper/SearXNG
2. **Reranking Request**: LibreChat sends results to our proxy (thinking it's Jina)
3. **Local Processing**: Our proxy uses BGE reranker to score relevance
4. **Ranked Results**: Returns results in Jina's expected format
5. **Scraping**: LibreChat scrapes the top-ranked results with Firecrawl

## Architecture

```
LibreChat → Jina Proxy (Port 8001) → BGE Reranker Model → Ranked Results
```

## Model Details

- **Primary Model**: `BAAI/bge-reranker-base`
  - State-of-the-art reranking performance
  - Optimized for cross-lingual tasks
  - ~279M parameters
  
- **Fallback Model**: `cross-encoder/ms-marco-MiniLM-L-6-v2`
  - Smaller, faster model if primary fails to load
  - ~23M parameters

## API Endpoints

### `POST /v1/rerank`
Rerank documents by relevance to a query.

**Request Format:**
```json
{
  "model": "jina-reranker-v1-base-en",
  "query": "your search query",
  "documents": ["doc1", "doc2", "doc3"],
  "top_n": 5,
  "return_documents": true
}
```

**Response Format:**
```json
{
  "model": "jina-reranker-v1-base-en",
  "usage": {"total_tokens": 150},
  "results": [
    {
      "index": 2,
      "relevance_score": 0.95,
      "document": {"text": "most relevant document"}
    },
    {
      "index": 0, 
      "relevance_score": 0.87,
      "document": {"text": "second most relevant"}
    }
  ]
}
```

### `GET /v1/models`
List available models (Jina compatibility).

### `GET /health`
Health check endpoint.

## Setup & Testing

### 1. Start the Service
```bash
# From the project root
docker-compose -f docker-compose.web.yml up jina_proxy
```

### 2. Test the Proxy
```bash
# Install test dependencies
pip install requests

# Run the test script
cd reranker-proxy
python test_proxy.py
```

### 3. Expected Output
```
Testing Jina-compatible proxy at http://localhost:8001
==================================================
1. Testing health endpoint...
   Status: 200
   Response: {'status': 'healthy', 'model_loaded': True, 'model_name': 'BAAI/bge-reranker-base'}

2. Testing models endpoint...
   Status: 200
   Response: {'object': 'list', 'data': [{'id': 'jina-reranker-v1-base-en', 'object': 'model', 'created': 1234567890, 'owned_by': 'jina-ai'}]}

3. Testing reranking endpoint...
   Status: 200
   Processing time: 0.45 seconds
   Model: jina-reranker-v1-base-en
   Token usage: 45
   Results count: 3

   Top ranked results:
     1. Score: 0.923 - Netherlands aims for carbon neutrality by 2050...
     2. Score: 0.887 - The Netherlands has significant wind energy capacity offshore...
     3. Score: 0.834 - Solar panels are becoming more popular in Dutch households...
```

## Performance

- **Startup Time**: ~30 seconds (model download + loading)
- **Inference Speed**: ~0.3-0.8 seconds for 5 documents
- **Memory Usage**: ~2-3GB RAM
- **Accuracy**: Comparable to Jina's commercial service

## Environment Variables Override

The Docker Compose configuration sets these environment variables in LibreChat:

```yaml
environment:
  JINA_API_BASE: http://jina_proxy:8000
  JINA_API_KEY: local-proxy-key
```

This redirects LibreChat's Jina API calls to our local proxy.

## Troubleshooting

### Model Download Issues
If the model fails to download, check:
- Internet connectivity in container
- Sufficient disk space (model is ~1GB)
- Try the fallback model manually

### Memory Issues
If the container runs out of memory:
- Increase Docker memory limit
- Use the smaller fallback model
- Reduce batch size in the code

### API Compatibility Issues
If LibreChat can't connect:
- Check container networking
- Verify environment variables are set
- Test endpoints manually with curl

## Performance Comparison

| Service | Speed | Cost | Quality | Rate Limits |
|---------|-------|------|---------|-------------|
| **Local Proxy** | ⭐⭐⭐⭐ | ✅ Free | ⭐⭐⭐⭐⭐ | ❌ None |
| Jina API | ⭐⭐⭐ | 💰 $0.02/1K | ⭐⭐⭐⭐⭐ | ⚠️ Yes |
| Cohere API | ⭐⭐⭐⭐ | 💰 $1/1K | ⭐⭐⭐⭐ | ⚠️ Yes |

## Next Steps

1. **Monitor Performance**: Check logs for reranking quality
2. **Optimize Model**: Fine-tune on your specific domain if needed
3. **Scale Resources**: Increase memory/CPU for higher loads
4. **Add Caching**: Cache frequent query-document pairs 