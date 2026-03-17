# Implementation Plan: Hiring & Onboarding Tool

## Overview

Implement the Hiring & Onboarding Tool as a right-side panel in LibreChat, following the SocialMediaPanel pattern. Covers MongoDB models, Express backend routes, WhatsApp integration, OnboardingAgent service, and React/TypeScript frontend components.

## Tasks

- [x] 1. Create MongoDB models for Candidate and HiringTask
  - Create `api/models/Candidate.js` with schema: name, whatsapp, role, status (pending/onboarding/active), onboardingData, onboardingStep, timestamps
  - Create `api/models/HiringTask.js` with schema: title, description, status (todo/in_progress/review/done), timestamps
  - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 2. Implement WhatsAppIntegration service and OnboardingAgent service
  - [x] 2.1 Create `api/server/services/WhatsAppIntegration.js`
    - Read `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` from env
    - Log warning and disable sending if either env var is missing
    - Implement `sendMessage(to, text)` calling Meta Cloud API `https://graph.facebook.com/v18.0/{phoneNumberId}/messages`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 2.2 Write unit tests for WhatsAppIntegration
    - Test warning logged and sending disabled when env vars missing (Req 8.3)
    - Test correct Meta API endpoint called when env vars set (Req 8.4)

  - [x] 2.3 Create `api/server/services/OnboardingAgent.js`
    - Implement `initiateConversation(candidate)`: send greeting, set status to `onboarding`
    - Implement `sendNextQuestion(candidateId)`: send next field prompt from ONBOARDING_FIELDS sequence
    - Implement `processResponse(candidateId, field, value)`: persist response to `onboardingData`
    - Implement `completeOnboarding(candidateId)`: set status to `active`
    - On WhatsApp send error: log and revert status to `pending`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 2.4 Write property test for OnboardingAgent status transitions
    - **Property 7: OnboardingAgent status transitions are correct**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5**

  - [ ]* 2.5 Write property test for onboarding response persistence
    - **Property 8: Onboarding responses are persisted**
    - **Validates: Requirements 3.6**

- [x] 3. Implement backend hiring routes
  - [x] 3.1 Create `api/server/routes/hiring.js` mounted at `/api/hiring`
    - `POST /candidates`: validate name+whatsapp, create Candidate, trigger OnboardingAgent, return 201
    - `GET /candidates`: return all candidates
    - `PATCH /candidates/:id`: partial update, return 404 if not found
    - `POST /tasks`: validate non-empty title, create HiringTask with status `todo`
    - `GET /tasks`: return all tasks
    - `PATCH /tasks/:id`: update task status or title, return 404 if not found
    - All routes require `requireJwtAuth`
    - Return HTTP 400 with descriptive message for missing required fields
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 3.2 Write property test for candidate creation returns Pending record
    - **Property 2: Adding a valid candidate creates a Pending record**
    - **Validates: Requirements 2.5, 7.1, 7.2**

  - [ ]* 3.3 Write property test for candidate CRUD round-trip
    - **Property 3: Candidate CRUD round-trip**
    - **Validates: Requirements 7.2, 7.3**

  - [ ]* 3.4 Write property test for missing fields returns HTTP 400
    - **Property 4: Missing required fields returns HTTP 400**
    - **Validates: Requirements 7.4**

  - [ ]* 3.5 Write property test for task CRUD round-trip
    - **Property 5: Task CRUD round-trip**
    - **Validates: Requirements 5.6, 7.5, 7.6**

  - [ ]* 3.6 Write property test for task creation without title rejected
    - **Property 6: Task creation without title is rejected**
    - **Validates: Requirements 5.4, 5.5**

- [x] 4. Register hiring routes in api/server/index.js
  - Add `safeRoute('/api/hiring', hiringRoutes, 'hiring')` following the existing pattern
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 5. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Create shared TypeScript types for the frontend
  - Create `client/src/components/HiringPanel/types.ts` with `Candidate`, `Task`, `TaskStatus`, `OnboardingStatus`, `AddCandidateInput`, `CreateTaskInput` interfaces
  - _Requirements: 2.1, 2.2, 4.1, 5.1_

- [x] 7. Implement custom hooks useHiringCandidates and useHiringTasks
  - [x] 7.1 Create `client/src/hooks/useHiringCandidates.ts`
    - Fetch candidates from `GET /api/hiring/candidates` using auth token
    - Expose `candidates`, `loading`, `addCandidate`, `updateCandidate`, `refetch`
    - Surface API errors via `useToastContext` `showToast({ status: 'error' })`
    - _Requirements: 2.5, 2.6, 4.1, 7.1, 7.2, 7.3_

  - [x] 7.2 Create `client/src/hooks/useHiringTasks.ts`
    - Fetch tasks from `GET /api/hiring/tasks` using auth token
    - Expose `tasks`, `loading`, `createTask`, `updateTask`, `refetch`
    - Surface API errors via `useToastContext`
    - _Requirements: 5.1, 5.3, 5.4, 7.5, 7.6_

- [x] 8. Implement AddCandidateForm component
  - Create `client/src/components/HiringPanel/AddCandidateForm.tsx`
  - Name input (required) and WhatsApp input (required, international format)
  - Optional role input
  - Client-side validation: non-empty name, whatsapp matches `/^\+[1-9]\d{7,14}$/`
  - Display inline validation error beneath invalid field without submitting
  - On valid submit: call `onSubmit(data)` prop
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 8.1 Write property test for WhatsApp number validation
    - **Property 1: WhatsApp number validation rejects all invalid formats**
    - **Validates: Requirements 2.3, 2.4**

- [x] 9. Implement TeamManagementView component
  - Create `client/src/components/HiringPanel/TeamManagementView.tsx`
  - Table with columns: Name, Role, WhatsApp, Status
  - Color-coded status badges: yellow=pending, blue=onboarding, green=active
  - Search input filtering rows by name (case-insensitive substring)
  - Status filter dropdown (All / Pending / Onboarding / Active)
  - "+ Add Employee" button that shows AddCandidateForm
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 9.1 Write property test for search filter
    - **Property 9: Search filter is case-insensitive and substring-based**
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 9.2 Write property test for status filter
    - **Property 10: Status filter returns only matching candidates**
    - **Validates: Requirements 4.5, 4.6**

  - [ ]* 9.3 Write property test for status badge color
    - **Property 11: Status badge color matches OnboardingStatus**
    - **Validates: Requirements 4.2**

- [x] 10. Implement TaskCard and TaskBoard components
  - [x] 10.1 Create `client/src/components/HiringPanel/TaskCard.tsx`
    - Render task title and description
    - Draggable card (HTML5 drag-and-drop)
    - _Requirements: 5.2, 5.3_

  - [x] 10.2 Create `client/src/components/HiringPanel/TaskBoard.tsx`
    - Four columns: To Do, In Progress, Review, Done
    - Render TaskCards in correct column based on task status
    - Accept drop events and call `onUpdateTask(id, { status })` with destination column status
    - "New Task" button with title input; show validation error if title empty; default to `todo`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 10.3 Write property test for TaskCard in correct column
    - **Property 12: TaskCard appears in correct column**
    - **Validates: Requirements 5.2**

- [x] 11. Implement HiringPanel root component and register in useSideNavLinks
  - [x] 11.1 Create `client/src/components/HiringPanel/HiringPanel.tsx`
    - Two tabs: "Team" and "Tasks"
    - Default to "Team" tab on first load
    - Persist active tab to localStorage key `hiring:active-tab`
    - Render TeamManagementView or TaskBoard based on active tab
    - Gate visibility with `import.meta.env.VITE_HIRING_ONBOARDING_TOOL === 'true'`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 11.2 Write property test for tab persistence
    - **Property 13: Active tab persists across remounts**
    - **Validates: Requirements 1.4, 6.2, 6.3**

  - [x] 11.3 Register HiringPanel in `client/src/hooks/Nav/useSideNavLinks.ts`
    - Import `HiringPanel` and a suitable icon (e.g. `Users` from lucide-react)
    - Add nav link entry gated by `import.meta.env.VITE_HIRING_ONBOARDING_TOOL === 'true'`
    - Follow the same pattern as the SocialMediaPanel entry
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
