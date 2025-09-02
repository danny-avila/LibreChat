#!/usr/bin/env python3
"""
Jina-compatible reranking proxy using local sentence-transformers
Mimics Jina's API format for seamless integration with LibreChat
"""

import json
import logging
from flask import Flask, request, jsonify
from sentence_transformers import CrossEncoder
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Load a high-quality cross-encoder for reranking
# BGE reranker is state-of-the-art and compatible with sentence-transformers
try:
    model = CrossEncoder('BAAI/bge-reranker-base')
    logger.info("Successfully loaded BAAI/bge-reranker-base model")
except Exception as e:
    logger.error(f"Failed to load model: {e}")
    # Fallback to a smaller model
    model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
    logger.info("Loaded fallback model: cross-encoder/ms-marco-MiniLM-L-6-v2")

@app.route('/v1/rerank', methods=['POST'])
def rerank():
    """
    Jina-compatible reranking endpoint
    
    Expected request format:
    {
        "model": "jina-reranker-v1-base-en",
        "query": "search query text",
        "documents": ["doc1 text", "doc2 text", ...],
        "top_n": 5,
        "return_documents": true
    }
    
    Returns Jina-compatible response format:
    {
        "model": "jina-reranker-v1-base-en", 
        "usage": {"total_tokens": 100},
        "results": [
            {"index": 0, "relevance_score": 0.95, "document": {"text": "..."}},
            {"index": 2, "relevance_score": 0.87, "document": {"text": "..."}},
            ...
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
            
        query = data.get('query', '')
        documents = data.get('documents', [])
        top_n = data.get('top_n', len(documents))
        return_documents = data.get('return_documents', True)
        model_name = data.get('model', 'jina-reranker-v1-base-en')
        
        if not query:
            return jsonify({"error": "Query is required"}), 400
            
        if not documents:
            return jsonify({"error": "Documents array is required"}), 400
            
        logger.info(f"Reranking {len(documents)} documents for query: {query[:100]}...")
        
        # Create query-document pairs for the cross-encoder
        pairs = [(query, doc) for doc in documents]
        
        # Get relevance scores
        scores = model.predict(pairs)
        
        # Create results with original indices
        results = []
        for i, score in enumerate(scores):
            result = {
                "index": i,
                "relevance_score": float(score)
            }
            
            # Include document text if requested (Jina format)
            if return_documents:
                result["document"] = {"text": documents[i]}
                
            results.append(result)
        
        # Sort by relevance score (descending) and take top_n
        results = sorted(results, key=lambda x: x["relevance_score"], reverse=True)[:top_n]
        
        # Estimate token usage (approximate)
        total_text = query + ' '.join(documents)
        estimated_tokens = len(total_text.split()) * 1.3  # Rough estimation
        
        response = {
            "model": model_name,
            "usage": {
                "total_tokens": int(estimated_tokens)
            },
            "results": results
        }
        
        logger.info(f"Reranking completed. Top score: {results[0]['relevance_score']:.3f}")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error during reranking: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/v1/models', methods=['GET'])
def list_models():
    """
    Jina-compatible models endpoint
    """
    return jsonify({
        "object": "list",
        "data": [
            {
                "id": "jina-reranker-v1-base-en",
                "object": "model",
                "created": 1234567890,
                "owned_by": "jina-ai"
            }
        ]
    })

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "model_loaded": model is not None,
        "model_name": "BAAI/bge-reranker-base"
    })

@app.route('/', methods=['GET'])
def root():
    """Root endpoint with service info"""
    return jsonify({
        "service": "Jina-compatible reranking proxy",
        "version": "1.0.0",
        "model": "BAAI/bge-reranker-base", 
        "endpoints": ["/v1/rerank", "/v1/models", "/health"]
    })

if __name__ == '__main__':
    logger.info("Starting Jina-compatible reranking proxy...")
    logger.info("Service will be available at http://localhost:8000")
    logger.info("Reranking endpoint: POST /v1/rerank")
    app.run(host='0.0.0.0', port=8000, debug=False) 