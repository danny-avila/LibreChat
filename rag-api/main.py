from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from typing import List, Optional
import hashlib
import asyncio

from config import settings
from embeddings import embeddings_client
from vector_store import vector_store
from document_processor import document_processor

app = FastAPI(title="LibreChat RAG API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class EmbedRequest(BaseModel):
    text: str
    file_id: Optional[str] = None

class SearchRequest(BaseModel):
    query: str
    file_id: Optional[str] = None
    k: int = 5

class EmbedResponse(BaseModel):
    status: bool  # LibreChat expects 'status' not 'success'
    known_type: bool = True  # LibreChat expects this field
    message: str
    file_id: Optional[str] = None

class SearchResponse(BaseModel):
    results: List[dict]
    query: str

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "RAG API is running"}

@app.post("/embed", response_model=EmbedResponse)
async def embed_document(
    file: UploadFile = File(...),
    file_id: Optional[str] = Form(None),  # LibreChat sends this as form data
    entity_id: Optional[str] = Form(None),  # LibreChat sends this for shared resources
    chunk_size: int = 1000,
    chunk_overlap: int = 200
):
    """Upload and embed a document"""
    try:
        # Read file content
        file_content = await file.read()
        
        # Use provided file_id or generate one
        if not file_id:
            file_id = hashlib.md5(f"{file.filename}_{len(file_content)}".encode()).hexdigest()
        
        # Extract text from file
        text = document_processor.extract_text_from_file(file_content, file.filename)
        
        if not text or len(text.strip()) < 10:
            raise HTTPException(status_code=400, detail="Unable to extract meaningful text from file")
        
        # Clean text
        text = document_processor.clean_text(text)
        
        # Split into chunks
        chunks = document_processor.split_text(text, chunk_size, chunk_overlap)
        
        if not chunks:
            raise HTTPException(status_code=400, detail="No text chunks generated from file")
        
        # Generate embeddings
        embeddings = await embeddings_client.embed_documents(chunks)
        
        # Prepare metadata for each chunk
        metadatas = []
        for i, chunk in enumerate(chunks):
            metadata = {
                "file_id": file_id,
                "filename": file.filename,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "chunk_size": len(chunk)
            }
            if entity_id:
                metadata["entity_id"] = entity_id
            metadatas.append(metadata)
        
        # Store in vector database
        document_ids = await vector_store.add_documents(chunks, embeddings, metadatas)
        
        if not document_ids:
            raise HTTPException(status_code=500, detail="Failed to store documents in vector database")
        
        return EmbedResponse(
            status=True,  # LibreChat expects 'status'
            known_type=True,  # LibreChat expects this
            message=f"Successfully embedded {len(chunks)} chunks from {file.filename}",
            file_id=file_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in embed_document: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/search", response_model=SearchResponse)
async def search_documents(request: SearchRequest):
    """Search for similar documents"""
    try:
        # Generate query embedding
        query_embedding = await embeddings_client.embed_query(request.query)
        
        # Search in vector store
        results = await vector_store.similarity_search(
            query_embedding, 
            k=3,  # Set to 3 as requested
            file_id=request.file_id,
            min_similarity=0.6  # Set minimum threshold
        )
        
        return SearchResponse(
            results=results,
            query=request.query
        )
        
    except Exception as e:
        print(f"Error in search_documents: {e}")
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")

@app.post("/query")
async def query_documents(request: SearchRequest):
    """Query documents with semantic search - used by LibreChat when RAG_USE_FULL_CONTEXT=false"""
    try:
        # Generate query embedding
        query_embedding = await embeddings_client.embed_query(request.query)
        
        # Search in vector store
        results = await vector_store.similarity_search(
            query_embedding, 
            k=3,  # Set to 3 as requested
            file_id=request.file_id,
            min_similarity=0.6  # Set minimum threshold
        )
        
        # Format response as LibreChat expects: array of arrays with page_content
        formatted_results = []
        for result in results:
            formatted_results.append([{
                "page_content": result.get("text", ""),
                "metadata": result.get("metadata", {}),
                "score": result.get("similarity", 0.0)
            }])
        
        return formatted_results
        
    except Exception as e:
        print(f"Error in query_documents: {e}")
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")

@app.get("/documents/{file_id}/context", response_class=PlainTextResponse)
async def get_document_context(file_id: str, query: Optional[str] = Query(None), k: int = Query(5)):
    """Get document context for a specific file - used by LibreChat for RAG"""
    try:
        # For full context mode, return all document text concatenated
        results = await vector_store.get_file_documents(file_id)
        
        if not results:
            return ""
        
        # Sort chunks by chunk_index to maintain order
        results.sort(key=lambda x: x.get("metadata", {}).get("chunk_index", 0))
        
        # Concatenate all text chunks
        full_text = "\n\n".join([result["text"] for result in results])
        
        # Return just the text content (not JSON) as LibreChat expects
        return full_text
        
    except Exception as e:
        print(f"Error getting document context: {e}")
        raise HTTPException(status_code=500, detail=f"Context retrieval error: {str(e)}")

@app.delete("/documents/{file_id}")
async def delete_document(file_id: str):
    """Delete all chunks for a specific file"""
    try:
        deleted_count = await vector_store.delete_file_documents(file_id)
        return {
            "success": True,
            "message": f"Deleted {deleted_count} document chunks",
            "file_id": file_id
        }
    except Exception as e:
        print(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail=f"Deletion error: {str(e)}")

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "LibreChat RAG API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "embed": "/embed",
            "search": "/search",
            "delete": "/documents/{file_id}"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
