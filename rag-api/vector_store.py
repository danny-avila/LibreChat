from pymongo import MongoClient
from typing import List, Dict, Any, Optional
import numpy as np
from datetime import datetime
from config import settings

class MongoVectorStore:
    def __init__(self):
        self.client = MongoClient(settings.mongodb_uri)
        self.db = self.client.get_default_database()
        self.collection = self.db[settings.mongodb_collection]
        
        # Create vector search index if it doesn't exist
        self._create_vector_index()
    
    def _create_vector_index(self):
        """Create a vector search index for similarity search"""
        try:
            # Check if index already exists
            existing_indexes = list(self.collection.list_indexes())
            vector_index_exists = any(
                'embedding' in idx.get('key', {}) for idx in existing_indexes
            )
            
            if not vector_index_exists:
                # Create a compound index for vector similarity search
                self.collection.create_index([
                    ("file_id", 1),
                    ("embedding", "2dsphere")  # For vector similarity
                ])
                print("Created vector search index")
        except Exception as e:
            print(f"Error creating vector index: {e}")
    
    async def add_documents(
        self, 
        texts: List[str], 
        embeddings: List[List[float]], 
        metadatas: List[Dict[str, Any]]
    ) -> List[str]:
        """Add documents with their embeddings to MongoDB"""
        documents = []
        document_ids = []
        
        for i, (text, embedding, metadata) in enumerate(zip(texts, embeddings, metadatas)):
            document = {
                "text": text,
                "embedding": embedding,
                "metadata": metadata,
                "created_at": datetime.now(),
                "file_id": metadata.get('file_id'),
                "chunk_index": i
            }
            documents.append(document)
        
        try:
            result = self.collection.insert_many(documents)
            document_ids = [str(doc_id) for doc_id in result.inserted_ids]
            print(f"Added {len(documents)} documents to MongoDB")
            return document_ids
        except Exception as e:
            print(f"Error adding documents to MongoDB: {e}")
            return []
    
    async def similarity_search(
        self, 
        query_embedding: List[float], 
        k: int = 5,
        file_id: Optional[str] = None,
        min_similarity: float = 0.6
    ) -> List[Dict[str, Any]]:
        """Perform similarity search using cosine similarity"""
        try:
            # Build query filter
            query_filter = {}
            if file_id:
                query_filter["file_id"] = file_id
            
            # For better performance, you could use MongoDB Atlas Vector Search:
            # https://docs.atlas.mongodb.com/atlas-vector-search/
            
            # Current approach: Get all documents and compute similarity in Python
            # This is NOT efficient for large datasets but works for development
            cursor = self.collection.find(query_filter)
            
            results = []
            for doc in cursor:
                # Calculate cosine similarity
                doc_embedding = doc.get('embedding', [])
                if doc_embedding:
                    similarity = self._cosine_similarity(query_embedding, doc_embedding)
                    results.append({
                        "text": doc.get('text', ''),
                        "metadata": doc.get('metadata', {}),
                        "similarity": similarity,
                        "file_id": doc.get('file_id'),
                        "chunk_index": doc.get('chunk_index', 0)
                    })
            
            # Sort by similarity and return top k
            results.sort(key=lambda x: x['similarity'], reverse=True)
            
            # Filter by minimum similarity threshold
            filtered_results = [r for r in results if r['similarity'] >= min_similarity]
            
            print(f"Vector search found {len(results)} documents, {len(filtered_results)} above threshold {min_similarity}")
            print(f"Top similarity scores: {[r['similarity'] for r in filtered_results[:3]]}")
            
            return filtered_results[:k]
            
        except Exception as e:
            print(f"Error performing similarity search: {e}")
            return []
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            vec1 = np.array(vec1)
            vec2 = np.array(vec2)
            
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            return float(dot_product / (norm1 * norm2))
        except Exception as e:
            print(f"Error calculating cosine similarity: {e}")
            return 0.0
    
    async def get_file_documents(self, file_id: str) -> List[Dict[str, Any]]:
        """Get all documents for a specific file"""
        try:
            cursor = self.collection.find({"file_id": file_id})
            documents = []
            for doc in cursor:
                # Convert ObjectId to string for JSON serialization
                doc["_id"] = str(doc["_id"])
                documents.append({
                    "text": doc.get("text", ""),
                    "metadata": {
                        "file_id": doc.get("file_id"),
                        "filename": doc.get("filename"),
                        "chunk_index": doc.get("chunk_index"),
                        "created_at": doc.get("created_at")
                    },
                    "score": 1.0  # No scoring for direct retrieval
                })
            return documents
        except Exception as e:
            print(f"Error getting file documents: {e}")
            return []
    
    async def delete_file_documents(self, file_id: str) -> int:
        """Delete all documents associated with a file"""
        try:
            result = self.collection.delete_many({"file_id": file_id})
            return result.deleted_count
        except Exception as e:
            print(f"Error deleting file documents: {e}")
            return 0

vector_store = MongoVectorStore()
