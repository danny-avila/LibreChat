# Contacts Workspace Integration — LibreChat

## Overview

This document describes the implementation of the Contacts feature added to LibreChat as part of the Serri fullstack intern assignment. The feature allows users to store structured contact information and query it through the AI assistant during normal chat interactions.

---

## Setup Instructions

### Prerequisites
- Node.js 18+
- MongoDB 7.0 running locally (`sudo systemctl start mongod`)
- A valid Google Gemini API key (starts with `AIza`)

### Installation
```bash
# 1. Clone the repository
git clone <your-repo-url>
cd LibreChat

# 2. Install dependencies
npm install
cd api && npm install csv-parser && cd ..

# 3. Configure environment
cp .env.example .env
# Edit .env and set:
#   GOOGLE_KEY=your_gemini_api_key
#   MONGO_URI=mongodb://127.0.0.1:27017/LibreChat

# 4. Build frontend
export NODE_OPTIONS="--max-old-space-size=4096"
npm run frontend

# 5. Start backend
npm run backend
```

Then open http://localhost:3080, register an account, and the Contacts panel will be available in the right sidebar.

---

## Architecture

### Overview

The implementation follows LibreChat's existing conventions throughout — same folder structure, same middleware patterns, same React Query approach as the Memories feature.
```
LibreChat/
├── api/
│   ├── db/
│   │   └── Contact.js                          ← Mongoose schema
│   └── server/
│       ├── routes/
│       │   └── contacts.js                     ← Express routes
│       ├── controllers/
│       │   └── ContactController.js            ← CRUD + CSV import
│       └── services/
│           └── ContactService.js               ← Chat context retrieval
├── client/
│   └── src/
│       ├── components/SidePanel/Contacts/
│       │   ├── ContactsPanel.tsx               ← Main panel
│       │   ├── ContactDetail.tsx               ← Detail view
│       │   ├── ContactForm.tsx                 ← Create/edit form
│       │   └── index.ts
│       └── data-provider/Contacts/
│           └── queries.ts                      ← React Query hooks
```

### Data Model

Contacts are stored in a `contacts` MongoDB collection with this structure:
```javascript
{
  _id: ObjectId,
  userId: ObjectId,       // owner — all queries are scoped per user
  name: String,           // required
  company: String,
  role: String,
  email: String,
  notes: String,
  attributes: Map<String, String>,  // arbitrary key-value metadata
  createdAt: Date,
  updatedAt: Date
}
```

The `attributes` field uses MongoDB's native Map type, which allows contacts to carry any number of arbitrary key-value pairs (Industry, Location, Funding Stage, Tags, etc.) without requiring schema changes. This is the natural MongoDB equivalent of a flexible key-value store.

**Indexes created:**
- Text index on `name`, `company`, `role`, `email`, `notes` — enables full-text search
- Compound index on `userId + company` — fast company lookups
- Compound index on `userId + name` — fast name lookups

### API Endpoints

All endpoints are protected by `requireJwtAuth` middleware and scoped to the authenticated user.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | List contacts (paginated, searchable) |
| POST | `/api/contacts` | Create a contact |
| GET | `/api/contacts/:id` | Get contact details |
| PUT | `/api/contacts/:id` | Update a contact |
| DELETE | `/api/contacts/:id` | Delete a contact |
| POST | `/api/contacts/import` | Bulk CSV import |

### Chat Integration

The chat integration uses a **retrieval-before-prompt** approach. Before each message is sent to the LLM, the system:

1. Inspects the user's message for contact-related intent (keywords like "who", "works at", "contact", "email", etc.)
2. If intent is detected, runs a MongoDB text search using terms extracted from the message
3. Falls back to regex search on name/company/role if text search returns no results
4. Formats the top 20 matching contacts into a compact context block
5. Injects this block into the shared run context alongside memory and RAG context

This injection happens in `api/server/controllers/agents/client.js`, following the exact same pattern as LibreChat's existing memory injection (`sharedRunContextParts.push(...)`).

**Example injected context:**
```
# Relevant Contacts from User's Contact List:
- John Doe, CTO at Acme Corp
  Email: john@acme.com
  Notes: Interested in AI infrastructure
  Industry: AI Infrastructure
  Location: San Francisco
```

### CSV Import

The import endpoint accepts multipart CSV uploads up to 100MB. It:
- Streams the CSV using `csv-parser` to avoid loading the entire file into memory
- Maps standard columns (`name`, `company`, `role`, `email`, `notes`) to core fields
- Treats all other columns as arbitrary attributes
- Inserts records in batches of 500 using `insertMany` with `ordered: false`
- Returns a summary of imported and skipped records

---

## Design Questions

### 1. If the system needed to support 1,000,000 contacts, how would you redesign it?

The current implementation can handle moderate scale reasonably well due to MongoDB indexes and batch imports, but for 1M contacts per user several changes would be needed:

**Database layer:**
- Move from MongoDB text search to a dedicated search engine like **Meilisearch** (already used by LibreChat for conversations) or **Elasticsearch**. These are optimized for full-text search at scale.
- Add pagination cursors instead of offset-based pagination to avoid expensive skip operations on large collections.
- Consider **sharding** the contacts collection by `userId` so each user's data lives on the same shard.

**Import pipeline:**
- Replace the current in-memory CSV parsing with a proper job queue (e.g., BullMQ with Redis, which LibreChat already supports). The user uploads the file, gets a job ID, and polls for completion.
- Stream directly from upload to database without buffering the entire file.
- Process in parallel workers for large files.

**Chat integration:**
- At 1M contacts, even targeted MongoDB queries may be slow. The right solution is **vector embeddings** — embed each contact as a vector and use similarity search (pgvector, Pinecone, or Meilisearch's vector search) to retrieve semantically relevant contacts. LibreChat already has a RAG API infrastructure that could be extended for this.
- Cache frequent query results in Redis.

### 2. How would you ensure the assistant retrieves the most relevant contacts for a query?

The current implementation uses keyword extraction + MongoDB full-text search, which works well for explicit queries ("who works at Acme Corp") but has limitations for semantic queries ("who should I talk to about fundraising").

A more robust approach in order of sophistication:

**Short term (current approach improved):**
- Better keyword extraction — use NLP to identify named entities (person names, company names, roles) from the query before searching
- Weight results by field relevance — a company name match should rank higher than a notes match
- Combine text search with targeted field queries for higher precision

**Medium term:**
- **LLM tool/function calling** — give the model a `search_contacts(query, filters)` tool and let it decide what to search for. The model is better at understanding query intent than regex patterns.

**Long term:**
- **Vector embeddings** — embed contact data and user queries into the same vector space. Retrieve by cosine similarity. This handles semantic queries naturally ("who is interested in infrastructure" matches contacts with notes about DevOps, cloud, etc.)
- Combine vector search with keyword filters for hybrid retrieval.

### 3. What are the limitations of your current implementation?

**Retrieval limitations:**
- The contact query detection uses simple keyword matching (`/who|works at|contact.../`). It will miss queries phrased unusually and may trigger unnecessarily on unrelated questions.
- MongoDB text search doesn't understand semantics — "VP of Engineering" won't match a contact with role "Head of Engineering".
- Injecting up to 20 contacts into every relevant prompt increases token usage and cost.

**Scale limitations:**
- Offset-based pagination (`skip()`) becomes slow beyond ~100k documents.
- CSV import buffers the entire file in memory before streaming — problematic for very large files despite the streaming parser.
- No background job system for large imports — the HTTP request will time out for 1M row files.

**UX limitations:**
- No real-time search as you type (currently requires pressing Enter or the search button).
- No deduplication during CSV import — importing the same file twice creates duplicates.
- Attributes must be added one at a time via the + button before submitting the form.

**Security:**
- No rate limiting on the contacts endpoints specifically.
- No maximum contact count per user enforced at the API level.

---

## Bonus Features Implemented

- ✅ Contact search (full-text via MongoDB text index)
- ✅ Contact editing
- ✅ Contact deletion
- ✅ Arbitrary attributes (create-time + visible in detail view)
- ✅ Paginated contact list
- ✅ CSV bulk import with progress feedback
- ✅ Relevant-only retrieval (extra credit) — only contacts matching the query are injected into the prompt, not all contacts

