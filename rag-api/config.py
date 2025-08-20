import os
from typing import List, Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # MongoDB settings
    mongodb_uri: str = "mongodb://localhost:27017/LibreChat"
    mongodb_collection: str = "vectors"
    
    # Google API settings
    google_api_key: str
    embedding_model: str = "models/text-embedding-004"
    
    # API settings
    host: str = "0.0.0.0"
    rag_port: int = 8080
    
    @property
    def port(self) -> int:
        return self.rag_port
    
    model_config = {
        "env_file": "../.env",
        "case_sensitive": False,
        "extra": "ignore"  # Ignore extra fields from .env
    }

settings = Settings()
