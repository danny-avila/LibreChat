# Document Upload Test Script

This script tests LibreChat's document handling to ensure files are properly processed and raw binary data never reaches the LLM.

## Quick Start

```bash
# Test with a file (pass the target agent ID)
./test-document-upload.sh /path/to/document.pdf "Summarize this document" agent-123

# Test with custom credentials and environment-driven agent
LIBRECHAT_USER=admin@example.com LIBRECHAT_PASS=password LIBRECHAT_AGENT_ID=agent-123 ./test-document-upload.sh document.pdf
```

## What It Tests

1. **File Upload** - Uploads document to LibreChat
2. **Text Extraction** - Verifies text is extracted from document
3. **LLM Query** - Sends message with document attachment
4. **Response Validation** - Checks for errors like "invalid message format"
5. **Log Analysis** - Examines Docker logs for raw binary data leaks

## Expected Behavior

✅ **PASS**: 
- File uploads successfully
- Text is extracted
- LLM receives only text (not raw binary)
- Response generated without errors
- Logs show document sanitization working

❌ **FAIL**:
- "invalid message format" error (indicates raw binary sent to LLM)
- "file_data" in logs or responses (raw base64 data leaked)
- Upload fails or no text extraction

## Environment Variables

- `LIBRECHAT_URL` - LibreChat URL (default: http://localhost:3080)
- `LIBRECHAT_USER` - Test user email (default: test@example.com)
- `LIBRECHAT_PASS` - Test user password (default: testpassword123)
- `LIBRECHAT_AGENT_ID` - Agent that should receive the uploaded file (required if not provided as the third argument)
- `LIBRECHAT_TOOL_RESOURCE` - Tool resource attached to the file (default: `file_search`)
- `LIBRECHAT_MODEL` - Model name to tag the upload (default: `gpt-4`)

## Examples

### Test PDF upload
```bash
./test-document-upload.sh document.pdf "What are the main points?" agent-123
```

### Test with custom server
```bash
LIBRECHAT_URL=https://chat.example.com LIBRECHAT_AGENT_ID=agent-123 ./test-document-upload.sh report.pdf
```

### Test Excel/Word/CSV
```bash
./test-document-upload.sh data.xlsx "Analyze this data" agent-123
./test-document-upload.sh report.docx "Summarize" agent-123
./test-document-upload.sh data.csv "What trends do you see?" agent-123
```

## Troubleshooting

### Login fails
- Check LibreChat is running: `docker compose ps`
- Verify credentials are correct
- Create test user if needed

### Upload fails
- Check file exists and is readable
- Verify file size is within limits
- Check Docker logs: `docker compose logs api`

### "invalid message format" error
- **This is the bug we're fixing!**
- Indicates raw binary data reached the LLM
- The fix should prevent this

## Integration with CI/CD

```bash
# Run as part of automated tests
if ./test-document-upload.sh test.pdf; then
    echo "Document handling tests passed"
else
    echo "Document handling tests FAILED"
    exit 1
fi
```

## What Gets Tested

### Security
- Raw binary data never sent to LLM APIs
- Base64 file_data stripped before LLM invocation

### Functionality  
- File upload works
- Text extraction successful
- Vector database integration
- Query handling with document context

### Error Handling
- Parsing failures caught before LLM call
- Clear error messages on failure
- No silent failures
