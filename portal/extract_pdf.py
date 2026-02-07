from pypdf import PdfReader
import sys

try:
    reader = PdfReader("/Users/artem/Downloads/Guide_LibreChat.pdf")
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    print(text)
except Exception as e:
    print(f"Error: {e}")
