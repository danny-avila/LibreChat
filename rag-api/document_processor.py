from typing import List, Dict, Any
import re
from io import BytesIO

class DocumentProcessor:
    def __init__(self):
        pass
    
    def split_text(self, text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
        """Split text into chunks with overlap"""
        if len(text) <= chunk_size:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            
            # Try to break at sentence boundaries
            if end < len(text):
                # Look for sentence endings near the chunk boundary
                sentence_end = text.rfind('.', start, end)
                if sentence_end > start + chunk_size // 2:
                    end = sentence_end + 1
                else:
                    # Look for word boundaries
                    word_end = text.rfind(' ', start, end)
                    if word_end > start + chunk_size // 2:
                        end = word_end
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            start = end - chunk_overlap
            if start >= len(text):
                break
        
        return chunks
    
    def extract_text_from_file(self, file_content: bytes, filename: str) -> str:
        """Extract text from various file formats"""
        file_ext = filename.lower().split('.')[-1]
        
        if file_ext == 'txt':
            return file_content.decode('utf-8', errors='ignore')
        elif file_ext == 'pdf':
            return self._extract_from_pdf(file_content)
        elif file_ext in ['docx', 'doc']:
            return self._extract_from_docx(file_content)
        else:
            # Try to decode as text
            try:
                return file_content.decode('utf-8', errors='ignore')
            except:
                return "Unable to extract text from this file format."
    
    def _extract_from_pdf(self, file_content: bytes) -> str:
        """Extract text from PDF"""
        try:
            import PyPDF2
            pdf_file = BytesIO(file_content)
            reader = PyPDF2.PdfReader(pdf_file)
            
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            
            return text
        except Exception as e:
            print(f"Error extracting PDF text: {e}")
            return "Error extracting text from PDF file."
    
    def _extract_from_docx(self, file_content: bytes) -> str:
        """Extract text from DOCX"""
        try:
            from docx import Document
            doc_file = BytesIO(file_content)
            doc = Document(doc_file)
            
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            
            return text
        except Exception as e:
            print(f"Error extracting DOCX text: {e}")
            return "Error extracting text from DOCX file."
    
    def clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        # Remove special characters that might interfere
        text = re.sub(r'[^\w\s\.\,\!\?\;\:\-\(\)]', ' ', text)
        return text.strip()

document_processor = DocumentProcessor()
