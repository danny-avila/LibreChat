# File Anonymization Service

This service automatically extracts text from uploaded files and removes Personally Identifiable Information (PII) before files are sent to OpenAI or stored.

## Overview

The anonymization service processes ALL uploaded files through two steps:

1. **Text Extraction**: Extracts text content from various file formats (PDF, DOCX, TXT, etc.)
2. **PII Removal**: Removes PII such as names, emails, phone numbers, addresses, credit cards, etc.

This happens automatically for ALL files before they are uploaded to OpenAI or stored in the system.

## Integration

The anonymization is integrated into LibreChat's file upload flow at two points:

- `processFileUpload()` - For assistant and regular file uploads
- `processAgentFileUpload()` - For agent file uploads

Both functions call `anonymizeFile()` right after the file is received but BEFORE it's uploaded to OpenAI/storage.

## Python Dependencies

The service requires Python 3 and the following Python packages:

```bash
pip install -r api/server/services/Files/Anonymization/requirements.txt
```

Or manually:

```bash
pip install textract>=1.6.3 scrubadub>=2.0.0 PyPDF2>=3.0.0 pdfplumber>=0.10.0
```

## How It Works

1. When a file is uploaded, it's first saved to a temporary location by Multer
2. The anonymization service extracts text from the file (if it's not already text)
3. PII is removed from the extracted text using scrubadub
4. The cleaned text replaces the original file content
5. The cleaned file is then uploaded to OpenAI/storage as normal

## Error Handling

If anonymization fails (e.g., Python not installed, dependencies missing), the system:
- Logs a warning
- Continues with the original file (does not block the upload)
- This ensures the system remains functional even if anonymization is unavailable

## Supported File Formats

- **PDF**: Uses pdfplumber, PyPDF2, or textract
- **DOC/DOCX**: Uses textract
- **TXT**: Direct text processing
- **RTF**: Uses textract
- **Other formats**: Supported by textract library

## PII Detection

The service detects and removes:
- Names
- Email addresses
- Phone numbers
- Credit card numbers
- Addresses
- Dates (can be configured)
- And more (via scrubadub detectors)

## Configuration

The service is enabled by default for all file uploads. To disable or modify behavior, edit:

- `api/server/services/Files/process.js` - Remove or modify the anonymization calls

## Logging

All anonymization activities are logged with the `[Anonymization]` prefix:
- File processing start/completion
- PII removal statistics
- Errors and warnings

## Testing

To test if the service is working:

1. Upload a file with PII (e.g., a PDF with phone numbers)
2. Check the logs for `[Anonymization]` messages
3. Verify the file content has PII removed before being sent to OpenAI

## Troubleshooting

**Python not found**: Ensure Python 3 is installed and in PATH
**Dependencies missing**: Run `pip install -r requirements.txt`
**Permission errors**: Ensure Python scripts are executable
**File processing fails**: Check logs for specific error messages

