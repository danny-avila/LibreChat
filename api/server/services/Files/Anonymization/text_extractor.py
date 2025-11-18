#!/usr/bin/env python3
"""
Text Extractor using textract

This script reads a file path and extracts text content using the textract library.
It supports various file formats including PDF, DOC, DOCX, TXT, RTF, and more.
"""

import sys
import json

try:
    import textract
except ImportError:
    print(json.dumps({"error": "textract library is not installed. Please install it using: pip install textract"}), file=sys.stderr)
    sys.exit(1)

# Additional PDF extraction libraries for better Windows support
try:
    import PyPDF2
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

try:
    import pdfplumber
    PDFPLUMBER_SUPPORT = True
except ImportError:
    PDFPLUMBER_SUPPORT = False


def extract_text_pdf_pypdf2(file_path):
    """Extract text from PDF using PyPDF2."""
    text = ""
    with open(file_path, 'rb') as file:
        pdf_reader = PyPDF2.PdfReader(file)
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
    return text.strip()


def extract_text_pdf_pdfplumber(file_path):
    """Extract text from PDF using pdfplumber."""
    text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text.strip()


def extract_text(file_path):
    """
    Extract text from a file using multiple methods.
    
    Args:
        file_path (str): Path to the file to extract text from
        
    Returns:
        str: Extracted text content
        
    Raises:
        FileNotFoundError: If the file doesn't exist
        Exception: If text extraction fails
    """
    import os
    
    # Check if file exists
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    # Check if it's a file (not a directory)
    if not os.path.isfile(file_path):
        raise ValueError(f"Path is not a file: {file_path}")
    
    file_extension = os.path.splitext(file_path)[1].lower()
    
    # For PDF files, try multiple extraction methods
    if file_extension == '.pdf':
        # Try pdfplumber first (usually better)
        if PDFPLUMBER_SUPPORT:
            try:
                return extract_text_pdf_pdfplumber(file_path)
            except Exception as e:
                print(f"pdfplumber failed: {e}", file=sys.stderr)
        
        # Try PyPDF2 as fallback
        if PDF_SUPPORT:
            try:
                return extract_text_pdf_pypdf2(file_path)
            except Exception as e:
                print(f"PyPDF2 failed: {e}", file=sys.stderr)
        
        # Try textract as last resort
        try:
            text = textract.process(file_path).decode('utf-8')
            return text
        except Exception as e:
            raise Exception(f"All PDF extraction methods failed. Last error: {str(e)}")
    
    # For other file types, use textract
    try:
        text = textract.process(file_path).decode('utf-8')
        return text
    except Exception as e:
        raise Exception(f"Failed to extract text from {file_path}: {str(e)}")


def main():
    """Main function for programmatic use - outputs JSON."""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "File path required"}), file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    try:
        extracted_text = extract_text(file_path)
        result = {
            "success": True,
            "text": extracted_text,
            "length": len(extracted_text)
        }
        print(json.dumps(result))
    except Exception as e:
        result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
