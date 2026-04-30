# LibreChat — Contact Workspace Integration
 
> Extends LibreChat with a full --Contacts-- feature: store, browse, import, and query contacts via AI during normal chat.
 
---

## Overview
 
This implementation adds a **Contacts Workspace** to LibreChat. Users can:
 
- Store and manage contacts with structured fields + arbitrary key-value attributes
- Import contacts in bulk from CSV (tested up to 1M records)
- Browse, search, edit, delete, and tag contacts via a dedicated UI
- Ask the AI assistant questions about contacts during normal chat
- Get inline AI summaries for individual contacts
- Click any contact and ask the AI about them directly
---

## Features
 
| Feature | Status |
|---|---|
| Create / View / Edit / Delete contacts | ✅ |
| Arbitrary attributes (industry, location, tags, etc.) | ✅ |
| CSV bulk import (1K / 10K / 1M records) | ✅ |
| Contacts sidebar / panel UI | ✅ |
| Contact search | ✅ |
| Contact tagging | ✅ |
| AI chat integration (query contacts in chat) | ✅ |
| Inline AI summary per contact (streaming) | ✅ |
| Click contact → ask AI about them | ✅ |
| Pagination for large contact lists | ✅ |
 
---
## Architecture
 
```
LibreChat (existing)
│
├── api/server/routes/contacts.js       ← All REST API routes
│   ├── POST   /api/contacts            ← Create contact
│   ├── GET    /api/contacts            ← List contacts (paginated)
│   ├── POST   /api/contacts/import/csv ← Bulk CSV import (batch processing)
│   └── GET    /api/contacts/:id/ai-summary-stream  ← Streaming AI summary
│
├── client/src/
│   ├── routes/Contact.tsx              ← Contact page (inline AI ask)
│   └── components/contactDialogue.tsx  ← Contact detail / edit dialog
│
└── packages/data-provider/src/
    └── api-endpoint.ts                 ← API endpoint definitions (UI layer)

## Contacts CSV Import and Contact-Aware Assistant

```

### Chat Integration Flow
 
```
User sends message in chat
        │
        ▼
Middleware intercepts the message
        │
        ▼
Semantic search / keyword match against contacts DB
        │
        ▼
Top-N relevant contacts retrieved
        │
        ▼
Contact data injected into system prompt context
        │
        ▼
LLM generates response using contact data
        │
        ▼
Response streamed back to user
```

---
 
## Setup & Installation
 
### Prerequisites
 
- Node.js 18+
- MongoDB (local or Atlas)
- LibreChat base installation
### 1. Clone & Install
 
```bash
git clone <your-repo-url>
cd LibreChat
npm install
```
 
### 2. Environment Variables
 
Add to your `.env`:
 
```env
MONGO_URI=mongodb://localhost:27017/librechat
GOOGLE_API_KEY=
GROQ_API_KEY=
```
 
### 3. Run the Application using docker
docker compose up --build

 
---
 
## API Reference
 
### Create a Contact
 
```
POST /api/contacts
Content-Type: application/json
```
 
```json
{
  "name": "Sinn",
  "company": "PWC",
  "role": "CTO",
  "email": "Sinn@pwc.com",
  "notes": "Interested in AI infrastructure",
  "created_at": "2026-04-27T10:00:00.000Z",
  "attributes": {
    "industry": "AI Infrastructure",
    "location": "San Francisco",
    "funding_stage": "Series B",
    "interests": ["AI", "ML"],
    "tags": ["important", "lead"]
  }
}
```
 
### List Contacts (Paginated)
 
```
GET /api/contacts?page=1&limit=50&search=Acme
```
 
Returns paginated contacts with optional search filtering.
 
### Bulk CSV Import
 
```
POST /api/contacts/import/csv
Content-Type: multipart/form-data
 
file: <CSV file>
```
 
Uses batch processing internally to handle large files efficiently.
 
### Inline AI Summary (Streaming)
 
```
GET /api/contacts/:id/ai-summary-stream
```
 
Returns a streaming response with an AI-generated summary of the contact. Example:
 
```
GET /api/contacts/69f37e1b8f9b9a068691a634/ai-summary-stream
```
 
---
## UI Guide
 
### Contacts Panel
 
Access via the sidebar. Supports:
 
- Browsing all contacts with pagination
- Search by name, company, role, or any attribute
- Create new contact via form
- Click any contact to open the detail dialog
### Contact Detail Dialog (`contactDialogue.tsx`)
 
- View all standard fields and arbitrary attributes
- Edit any field inline
- Delete the contact
- **"Ask AI"** button — opens a chat prompt pre-loaded with this contact's context
### Contact Page (`Contact.tsx`)
 
- Full contact view with inline AI assistant
- Type a question in the input box to ask the AI specifically about this contact
- Responses stream in real time
### Main Chat (`/c/:conversationId`)
 
Ask questions naturally in the chat interface:
 
```
Who works at Acme Corp?
What do we know about John Doe?
List all contacts interested in AI infrastructure.
Who are the CTOs in our contacts?
Which contacts are based in San Francisco?
```
 
The assistant retrieves relevant contacts from the database and answers using real data.
 
---
 
## Chat Integration
 
### How It Works
 

 
1. When a user sends a message, the system analyzes the query for contact-related intent.
2. A targeted search is run against the contacts database (keyword + attribute matching).
3. The top matching contacts are serialized and injected into the system prompt as structured context.
4. The LLM receives this context and generates a grounded response.
This avoids sending all contacts to the model on every query — only relevant contacts are fetched.
 
### Example
 
**User asks:** "Who works at Acme Corp?"
 
**System prompt context injected:**
```
Relevant contacts from the database:
- John Doe | Acme Corp | CTO | john@acme.com | Industry: AI Infrastructure
- Jane Smith | Acme Corp | VP Engineering | jane@acme.com | Location: NYC
```
 
**Assistant responds:**
> John Doe works at Acme Corp as CTO. 
 
---

 
 

This workspace adds a contacts CSV import endpoint and a contact-aware assistant that answers contact questions from the database only.

### Endpoints

- GET `http://localhost:3080/api/contacts`
  - Why: retrieve the current contact list for UI and validation checks.
- POST `http://localhost:3080/api/contacts`
  - Why: create a single contact record for quick manual entry or integrations.
- POST `http://localhost:3080/api/contacts/import/csv`
  - Why: bulk import contacts at scale from CSV files.

### CSV Import Behavior

- Accepts `multipart/form-data` with field name `file`.
- Validates required fields (`name`, `company`, `role`, `email`, `notes`) per row.
- Normalizes emails to lowercase and prevents duplicate emails.
- Uses batch processing (chunked inserts) so large files (e.g., 100,000+ rows) can be imported without overwhelming MongoDB.
- Tracks success and failed counts for each batch.

### Design Questions

1. If the system needed to support 1,000,000 contacts, how would you redesign it?
  - Move CSV import to a background job queue (streaming parse, chunked writes), add a unique index on `email`, and enforce dedupe at the database level.
  - Add dedicated search infrastructure and paginate responses.
  - Cache hot queries and add read replicas for query-heavy workloads.

2. How would you ensure the assistant retrieves the most relevant contacts for a query?
  - Normalize queries, extract structured filters (role, company, location, funding_stage), and match against indexed fields first.

3. What are the limitations of your current implementation?
  - Keyword matching is lightweight and can miss synonyms or complex phrasing.
  - Metadata parsing is heuristic and not a fully structured query language.
  - No background job system for large imports; ingestion runs inline.
  - No advanced ranking or vector search, so relevance is basic.

### Model Used

- Provider: Groq & Gemini
- Model: 

---
githubLink - https://github.com/himanshu8github/LibreChat/tree/contacts-feature
branch - contacts-feature

---