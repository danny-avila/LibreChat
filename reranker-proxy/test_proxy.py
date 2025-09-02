#!/usr/bin/env python3
"""
Test script for the Jina-compatible reranking proxy
"""

import requests
import json
import time

def test_proxy(base_url="http://localhost:8001"):
    """Test the proxy service endpoints"""
    
    print(f"Testing Jina-compatible proxy at {base_url}")
    print("=" * 50)
    
    # Test 1: Health check
    print("1. Testing health endpoint...")
    try:
        response = requests.get(f"{base_url}/health")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"   Error: {e}")
    
    print()
    
    # Test 2: Models endpoint
    print("2. Testing models endpoint...")
    try:
        response = requests.get(f"{base_url}/v1/models")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"   Error: {e}")
    
    print()
    
    # Test 3: Reranking with sample data
    print("3. Testing reranking endpoint...")
    sample_request = {
        "model": "jina-reranker-v1-base-en",
        "query": "renewable energy in the Netherlands",
        "documents": [
            "The Netherlands has significant wind energy capacity offshore",
            "Solar panels are becoming more popular in Dutch households", 
            "Nuclear energy debate continues in the Netherlands",
            "Traditional fossil fuels still dominate Dutch energy mix",
            "Netherlands aims for carbon neutrality by 2050"
        ],
        "top_n": 3,
        "return_documents": True
    }
    
    try:
        start_time = time.time()
        response = requests.post(
            f"{base_url}/v1/rerank",
            json=sample_request,
            headers={"Content-Type": "application/json"}
        )
        end_time = time.time()
        
        print(f"   Status: {response.status_code}")
        print(f"   Processing time: {end_time - start_time:.2f} seconds")
        
        if response.status_code == 200:
            result = response.json()
            print(f"   Model: {result.get('model')}")
            print(f"   Token usage: {result.get('usage', {}).get('total_tokens')}")
            print(f"   Results count: {len(result.get('results', []))}")
            
            print("\n   Top ranked results:")
            for i, item in enumerate(result.get('results', [])[:3]):
                score = item.get('relevance_score', 0)
                doc_text = item.get('document', {}).get('text', '')[:80]
                print(f"     {i+1}. Score: {score:.3f} - {doc_text}...")
        else:
            print(f"   Error response: {response.text}")
            
    except Exception as e:
        print(f"   Error: {e}")

if __name__ == "__main__":
    test_proxy() 