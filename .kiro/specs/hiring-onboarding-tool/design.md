# Design Document: Hiring & Onboarding Tool

## Overview

The Hiring & Onboarding Tool is a right-side panel feature integrated into LibreChat's existing SidePanel system. It provides HR teams and hiring managers with a unified interface to:

1. Add candidates and trigger automated WhatsApp onboarding conversations via an AI agent
2. Track all candidates and employees in a Team Management table with status badges
3. Manage hiring and onboarding tasks on a Kanban-style Task Board

The feature follows the exact same pattern as the existing `SocialMediaPanel` — registered as a nav link in `useSideNavLinks`, gated by a `VITE_HIRING_ONBOARDING_TOOL` environment variable, and rendered inside the right-side `ResizablePanel`.

---

## Architecture

```mermaid
graph TD
    subgraph Frontend [React + TypeScript]
        HP[HiringPanel.tsx]
        TMV[TeamManagementView.tsx]
        TB[TaskBoard.tsx]
        ACF[AddCandidateForm.tsx]
        TC[TaskCard.tsx]
        UHC[useHiringCandidates hook]
        UHT[useHiringTasks hook]
    end

    subgraph SidePanel [SidePanel System]
        USNL[useSideNavLinks.ts]
        SP[SidePanel.tsx]
    end

    subgraph Backend [Express.js API]
        HR[/api/hiring router]
        CR[candidates routes]
        TR[tasks routes]
        OA[OnboardingAgent service]
        WI[WhatsAppIntegration service]
    end

    subgraph Database [MongoDB]
        CM[Candidate model]
        TM[Task model]
    end

    subgraph External [External APIs]
        WA[Meta WhatsApp Cloud API]
    end

    USNL --> HP
    SP --> USNL
    HP --> TMV
    HP --> TB
    HP --> ACF
    TB --> TC
    UHC --> CR
    UHT --> TR
    TMV --> UHC
    TB --> UHT
    ACF --> UHC
    CR --> CM
    TR --> TM
    CR --> OA
    OA --> WI
    WI --> WA
```

The architecture is deliberately layered:
- **Frontend** components are purely presentational, delegating all data fetching to custom hooks
- **Backend routes** handle validation and delegate business logic to service classes
- **OnboardingAgent** is a stateless service that orchestrates the WhatsApp conversation flow
- **WhatsAppIntegration** is a thin wrapper around the Meta Cloud API, making it easy to swap or mock

---

## Components and Interfaces

### Frontend Components

#### `HiringPanel.tsx`
The root panel component, analogous to `SocialMediaPanel.tsx`.

```typescript
// Registered in useSideNavLinks with id: 'hiring-onboarding'
// Gated by: import.meta.env.VITE_HIRING_ONBOARDING_TOOL === 'true'

type HiringTab = 'team' | 'tasks';

interface HiringPanelProps {} // no props — self-contained

// Active tab persisted to localStorage key: 'hiring:active-tab'
```

#### `TeamManagementView.tsx`
Renders the candidate table with search and filter controls.

```typescript
interface TeamManagementViewProps {
  candidates: Candidate[];
  loading: boolean;
  onAddCandidate: (data: AddCandidateInput) => Promise<void>;
}
```

#### `TaskBoard.tsx`
Renders the four-column Kanban board with drag-and-drop support.

```typescript
type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

interface TaskBoardProps {
  tasks: Task[];
  loading: boolean;
  onCreateTask: (data: CreateTaskInput) => Promise<void>;
  onUpdateTask: (id: string, data: Partial<Task>) => Promise<void>;
}
```

#### `AddCandidateForm.tsx`
Inline form for adding a new candidate. Handles client-side validation.

```typescript
interface AddCandidateInput {
  name: string;
  whatsapp: string;
  role?: string;
}

// Validation regex: /^\+[1-9]\d{7,14}$/
```

#### `TaskCard.tsx`
Individual draggable task card.

```typescript
interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => void;
}
```

### Custom Hooks

#### `useHiringCandidates`
```typescript
function useHiringCandidates(): {
  candidates: Candidate[];
  loading: boolean;
  addCandidate: (data: AddCandidateInput) => Promise<Candidate>;
  updateCandidate: (id: string, data: Partial<Candidate>) => Promise<Candidate>;
  refetch: () => void;
}
```

#### `useHiringTasks`
```typescript
function useHiringTasks(): {
  tasks: Task[];
  loading: boolean;
  createTask: (data: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>;
  refetch: () => void;
}
```

### Backend Routes

#### `api/server/routes/hiring.js`
Mounted at `/api/hiring`. All routes require `requireJwtAuth`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/candidates` | Create candidate, trigger OnboardingAgent |
| GET | `/candidates` | List all candidates |
| PATCH | `/candidates/:id` | Update candidate fields |
| POST | `/tasks` | Create a task |
| GET | `/tasks` | List all tasks |
| PATCH | `/tasks/:id` | Update task status or title |

### Backend Services

#### `OnboardingAgent` (`api/server/services/OnboardingAgent.js`)
Orchestrates the WhatsApp conversation flow. Stateless — reads/writes candidate state via the Candidate model.

```javascript
class OnboardingAgent {
  // Sends initial greeting and updates status to 'onboarding'
  async initiateConversation(candidate) {}
  
  // Sends the next question in the onboarding sequence
  async sendNextQuestion(candidateId) {}
  
  // Stores a collected response and advances the conversation
  async processResponse(candidateId, field, value) {}
  
  // Called when all fields are collected; sets status to 'active'
  async completeOnboarding(candidateId) {}
}

// Onboarding field sequence (in order):
const ONBOARDING_FIELDS = [
  'fullLegalName',
  'dateOfBirth',
  'address',
  'emergencyContact',
  'roleStartDate',
];
```

#### `WhatsAppIntegration` (`api/server/services/WhatsAppIntegration.js`)
Thin wrapper around the Meta WhatsApp Cloud API.

```javascript
class WhatsAppIntegration {
  constructor() {
    this.apiToken = process.env.WHATSAPP_API_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.enabled = !!(this.apiToken && this.phoneNumberId);
    
    if (!this.enabled) {
      logger.warn('[WhatsApp] WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set. WhatsApp sending disabled.');
    }
  }

  // POST https://graph.facebook.com/v18.0/{phoneNumberId}/messages
  async sendMessage(to, text) {}
}
```

---

## Data Models

### Candidate (`api/models/Candidate.js`)

```javascript
const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  whatsapp: { type: String, required: true },
  role: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'onboarding', 'active'],
    default: 'pending',
  },
  onboardingData: {
    // Collected during WhatsApp conversation
    fullLegalName: String,
    dateOfBirth: String,
    address: String,
    emergencyContact: String,
    roleStartDate: String,
  },
  onboardingStep: {
    // Index into ONBOARDING_FIELDS array; tracks conversation progress
    type: Number,
    default: 0,
  },
}, { timestamps: true });
```

### Task (`api/models/HiringTask.js`)

```javascript
const hiringTaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'review', 'done'],
    default: 'todo',
  },
}, { timestamps: true });
```

### API Response Shapes

```typescript
// Candidate
interface Candidate {
  _id: string;
  name: string;
  whatsapp: string;
  role: string;
  status: 'pending' | 'onboarding' | 'active';
  onboardingData: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// Task
interface Task {
  _id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  createdAt: string;
  updatedAt: string;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: WhatsApp number validation rejects all invalid formats

*For any* string that does not match `^\+[1-9]\d{7,14}$` (including empty strings, strings without a leading `+`, strings with non-digit characters after `+`, or strings of incorrect length), the `validateWhatsApp` function should return `false`; and *for any* string that does match the pattern, it should return `true`.

**Validates: Requirements 2.3, 2.4**

---

### Property 2: Adding a valid candidate creates a Pending record

*For any* valid candidate input `{ name, whatsapp, role? }` where name is non-empty and whatsapp matches the required format, calling `POST /api/hiring/candidates` should return a record with `status: "pending"` and the same `name` and `whatsapp` values, and a subsequent `GET /api/hiring/candidates` should include that record.

**Validates: Requirements 2.5, 7.1, 7.2**

---

### Property 3: Candidate CRUD round-trip

*For any* candidate created via `POST /api/hiring/candidates`, patching it via `PATCH /api/hiring/candidates/:id` with any valid partial update should return a record that reflects exactly those changes, and `GET /api/hiring/candidates` should return the updated values.

**Validates: Requirements 7.2, 7.3**

---

### Property 4: Missing required fields returns HTTP 400

*For any* request to `POST /api/hiring/candidates` that omits `name` or `whatsapp`, the API should return HTTP 400 with a descriptive error message and no candidate should be created.

**Validates: Requirements 7.4**

---

### Property 5: Task CRUD round-trip

*For any* task created via `POST /api/hiring/tasks` with a non-empty title, the task should appear in `GET /api/hiring/tasks` with `status: "todo"`, and patching it via `PATCH /api/hiring/tasks/:id` should return the updated record with the new status or title.

**Validates: Requirements 5.6, 7.5, 7.6**

---

### Property 6: Task creation without title is rejected

*For any* request to `POST /api/hiring/tasks` with an empty or whitespace-only title, the API should return HTTP 400 and no task should be created.

**Validates: Requirements 5.4, 5.5**

---

### Property 7: OnboardingAgent status transitions are correct

*For any* candidate with `status: "pending"`, after `OnboardingAgent.initiateConversation` succeeds, the candidate's status should be `"onboarding"`. After `OnboardingAgent.completeOnboarding` is called, the status should be `"active"`. If `WhatsAppIntegration.sendMessage` throws, the status should remain or revert to `"pending"`.

**Validates: Requirements 3.1, 3.3, 3.4, 3.5**

---

### Property 8: Onboarding responses are persisted

*For any* candidate in `"onboarding"` status, calling `OnboardingAgent.processResponse(candidateId, field, value)` should result in the candidate record's `onboardingData[field]` equaling `value` when retrieved from the database.

**Validates: Requirements 3.6**

---

### Property 9: Search filter is case-insensitive and substring-based

*For any* list of candidates and any search string `q`, the filtered result should contain exactly those candidates whose `name` contains `q` as a substring (case-insensitive), and no others.

**Validates: Requirements 4.3, 4.4**

---

### Property 10: Status filter returns only matching candidates

*For any* list of candidates and any selected status value (or "all"), the filtered result should contain exactly those candidates whose `status` equals the selected value (or all candidates when "all" is selected).

**Validates: Requirements 4.5, 4.6**

---

### Property 11: Status badge color matches OnboardingStatus

*For any* candidate with a given `status`, the rendered badge component should apply the correct CSS class: yellow for `"pending"`, blue for `"onboarding"`, green for `"active"`.

**Validates: Requirements 4.2**

---

### Property 12: TaskCard appears in correct column

*For any* task with a given `status`, the TaskBoard render should place that task's card in the column corresponding to that status, and in no other column.

**Validates: Requirements 5.2**

---

### Property 13: Active tab persists across remounts

*For any* tab value (`"team"` or `"tasks"`) selected in HiringPanel, unmounting and remounting the component should restore the same active tab from localStorage.

**Validates: Requirements 1.4, 6.2, 6.3**

---

## Error Handling

### Frontend

- **Form validation errors**: Displayed inline beneath the relevant input field. The form is not submitted until all fields are valid. No toast is shown for validation errors — only for server errors.
- **API errors**: Caught in the custom hooks and surfaced via LibreChat's `useToastContext` `showToast({ status: 'error' })` pattern, consistent with `SocialMediaPanel`.
- **Loading states**: Each hook exposes a `loading` boolean. Components render a skeleton or spinner while loading.

### Backend

- **Missing required fields**: Routes return `HTTP 400` with `{ error: '<field> is required' }`.
- **Not found**: `PATCH` routes return `HTTP 404` if the document does not exist.
- **WhatsApp send failure**: `OnboardingAgent` catches errors from `WhatsAppIntegration`, logs them via the existing `winston` logger, and sets the candidate status back to `"pending"`. The error does not propagate to the HTTP response — the candidate creation still returns `201`.
- **WhatsApp disabled**: When `WHATSAPP_API_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is missing, `WhatsAppIntegration.sendMessage` is a no-op that logs a warning. The rest of the system continues to function.

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:
- **Unit tests** verify specific examples, integration points, and error conditions
- **Property tests** verify universal correctness across all valid inputs

### Property-Based Testing

**Library**: [fast-check](https://github.com/dubzzz/fast-check) for both frontend (Jest/Vitest) and backend (Jest) tests.

Each property test runs a minimum of **100 iterations**.

Each test is tagged with a comment in the format:
`// Feature: hiring-onboarding-tool, Property <N>: <property_text>`

**Property test mapping:**

| Property | Test file | What is generated |
|----------|-----------|-------------------|
| P1: WhatsApp validation | `validateWhatsApp.test.ts` | Random strings, valid/invalid phone numbers |
| P2: Add candidate creates Pending record | `candidates.routes.test.js` | Random valid candidate inputs |
| P3: Candidate CRUD round-trip | `candidates.routes.test.js` | Random partial update objects |
| P4: Missing fields returns 400 | `candidates.routes.test.js` | Random objects missing name or whatsapp |
| P5: Task CRUD round-trip | `tasks.routes.test.js` | Random task inputs and partial updates |
| P6: Task creation without title rejected | `tasks.routes.test.js` | Empty/whitespace strings |
| P7: OnboardingAgent status transitions | `OnboardingAgent.test.js` | Random candidate objects, mock WhatsApp responses |
| P8: Onboarding responses persisted | `OnboardingAgent.test.js` | Random field/value pairs |
| P9: Search filter | `TeamManagementView.test.tsx` | Random candidate lists and search strings |
| P10: Status filter | `TeamManagementView.test.tsx` | Random candidate lists and status values |
| P11: Status badge color | `TeamManagementView.test.tsx` | All three status enum values |
| P12: TaskCard in correct column | `TaskBoard.test.tsx` | Random task lists with random statuses |
| P13: Tab persistence | `HiringPanel.test.tsx` | Both tab values |

### Unit Tests

Unit tests cover:
- `HiringPanel` renders both tabs and defaults to "Team" on first load (Req 6.1, 6.4)
- `AddCandidateForm` shows inline error for invalid WhatsApp number (Req 2.4)
- `TaskBoard` shows validation error when title is empty (Req 5.5)
- `WhatsAppIntegration` logs warning and disables sending when env vars are missing (Req 8.3)
- `WhatsAppIntegration` calls the correct Meta API endpoint when env vars are set (Req 8.4)
- `useSideNavLinks` includes the hiring panel link when `VITE_HIRING_ONBOARDING_TOOL=true` (Req 1.3)
