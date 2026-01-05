# Document Handling Implementation Checklist

## Goal
Ensure uploaded files (PDF, Excel, Word, CSV) are processed correctly:
- Files converted to text before sending to LLM
- Text stored in vector database
- Original files + text transcripts stored for auditing
- LLM can query vectordb for document-related questions
- No raw binary data sent to LLM APIs

## Status Key
- [ ] Not started
- [⏳] In progress
- [✓] Completed
- [❌] Failed/Blocked

---

## Phase 1: Backend - File Upload & Processing

### 1.1 File Upload Endpoint
- [❌] Verify `/api/files/images` endpoint handles documents *(route remains image-only; document uploads go through `/api/files`)*
- [✓] Add file format detection (PDF, DOCX, XLSX, CSV, TXT)
- [✓] Implement text extraction for each format
- [✓] Store original file for auditing
- [✓] Store extracted text separately


### 1.2 Vector Database Integration
- [✓] Verify RAG API connection (http://rag_api:8000)
- [✓] Implement text chunking for vector storage
- [✓] Store document chunks in vectordb with metadata
- [✓] Add file reference (file_id) to vector entries

### 1.3 Document Sanitization
- [✓] Strip file_data before saving to MongoDB (Message.js saveMessage)
- [✓] Strip file_data when loading from MongoDB (Message.js getMessages/getMessage)
- [✓] Validate no raw binary in message payload (BaseClient validateDocumentsBeforeCompletion)
- [✓] Add comprehensive logging for sanitization

---

## Phase 2: Message Processing Flow

### 2.1 Message Construction
- [ ] Ensure userMessage uses only text + file reference
- [ ] Remove documents array with file_data
- [ ] Add fileContext with extracted text
- [ ] Preserve file metadata (filename, file_id, type)

### 2.2 Agent Endpoint Handling
- [✓] Skip document encoding for agent endpoints (BaseClient.addDocuments)
- [✓] Use extracted text from vectordb/fileContext (processAgentFileUpload)
- [⏳] Ensure processAttachments doesn't add file_data
- [✓] Validate addDocuments returns empty for agents

### 2.3 LLM Payload Validation
- [✓] Add validation before sendCompletion (validateDocumentsBeforeCompletion)
- [✓] Strip any remaining file_data as final safety net (BaseClient.sendMessage lines 668-683)
- [✓] Log warnings when file_data is detected
- [✓] Throw error if binary data reaches LLM call

---

## Phase 3: Frontend Changes

### 3.1 UI Text Updates
- [ ] Change "Upload File" button to "Add Attachment"
- [ ] Update file upload dialog text
- [ ] Show file processing status indicator
- [ ] Display text extraction progress

### 3.2 File Processing Feedback
- [ ] Show "Processing document..." message
- [ ] Display extracted text preview
- [ ] Show success confirmation when ready
- [ ] Error handling for unsupported formats

### 3.3 Document Query Interface
- [ ] Add indicator that document is available for queries
- [ ] Show which files are attached to conversation
- [ ] Allow removing attached documents
- [ ] Clear visual distinction for document-based queries

---

## Phase 4: Testing & Validation

### 4.1 CLI Test Script
- [ ] Fix authentication (401 error)
- [ ] Verify file upload succeeds
- [ ] Confirm text extraction occurs
- [ ] Validate no file_data in logs
- [ ] Test with multiple file formats

### 4.2 UI Testing
- [✓] Upload PDF via UI - File uploads successfully
- [✓] Verify no "400 invalid message format" error - **FIXED!** Latest test passed
- [⏳] Confirm LLM responds with document content - LLM responds but asks for document text
- [ ] Test with Excel, Word, CSV files
- [⏳] Verify vectordb query functionality - Need to enable file_search tool

### 4.3 Log Analysis
- [ ] Check for file_data stripping warnings
- [ ] Verify no raw binary in debug logs
- [ ] Confirm text extraction logs appear
- [ ] Validate vectordb storage logs

### 4.4 End-to-End Validation
- [ ] Upload document
- [ ] Ask question about document
- [ ] Verify LLM uses document content in response
- [ ] Confirm no errors in console/logs
- [ ] Test multiple documents in same conversation

---

## Phase 5: Documentation

### 5.1 Code Documentation
- [ ] Document file processing flow
- [ ] Add inline comments for sanitization code
- [ ] Update API documentation
- [ ] Document vectordb integration

### 5.2 User Documentation
- [ ] Update README with document handling info
- [ ] Create usage examples
- [ ] Document supported file formats
- [ ] Add troubleshooting guide

---

## Current Issues to Fix

1. **✅ FIXED: Documents with file_data no longer sent to LLM** - Messages now send without 400 error!
2. **⏳ NEW ISSUE: File text not available to LLM** - LLM asks "provide me with the document"
3. **Need to verify file_search tool is enabled** - Check if agent has file_search configured
4. **Need to verify file embedding worked** - Check if text was extracted and stored in vectordb
5. **May need to attach file to conversation** - Verify file is accessible in conversation context

---

## Recent Changes (2026-01-01)

**✅ SUCCESS - 400 Error Fixed!**
- Latest test (conversation 7f41f8ca) completed WITHOUT "400 invalid message format"
- userMessage no longer contains documents with file_data
- LLM successfully responds (but doesn't have access to file content yet)

**Critical Fix Applied:**
- Added `sanitizeMessageDocuments()` function in `/root/Projects/LibreChat/api/models/Message.js`
- Enhanced stripping in `/root/Projects/LibreChat/api/server/controllers/agents/request.js`
- Strips `file_data` from documents when messages are loaded from MongoDB
- Prevents old messages with raw binary from polluting conversation context

**Next Steps:**
1. ✅ Verify agent has `file_search` tool enabled in UI
2. Check if uploaded file was successfully processed and embedded
3. Verify file is attached to the conversation or agent's tool_resources
4. Test querying the file content through file_search tool

---

## Next Actions

Starting with most critical issue: **Find where documents with file_data are added to userMessage**

