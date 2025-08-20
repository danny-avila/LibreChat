import google.generativeai as genai
from typing import List
import numpy as np
from config import settings

# Configure Google AI
genai.configure(api_key=settings.google_api_key)

class GoogleEmbeddings:
    def __init__(self):
        self.model_name = settings.embedding_model
    
    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple documents"""
        embeddings = []
        for text in texts:
            try:
                result = genai.embed_content(
                    model=self.model_name,
                    content=text,
                    task_type="retrieval_document"
                )
                embeddings.append(result['embedding'])
            except Exception as e:
                print(f"Error generating embedding: {e}")
                # Fallback to zero vector if embedding fails
                embeddings.append([0.0] * 768)  # Default dimension
        return embeddings
    
    async def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a single query"""
        try:
            result = genai.embed_content(
                model=self.model_name,
                content=text,
                task_type="retrieval_query"
            )
            return result['embedding']
        except Exception as e:
            print(f"Error generating query embedding: {e}")
            return [0.0] * 768  # Default dimension

embeddings_client = GoogleEmbeddings()
