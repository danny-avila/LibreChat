# Requirements Document

## Introduction

The Hiring & Onboarding Tool is a right-side panel feature integrated into LibreChat's existing SidePanel system. It enables HR teams and hiring managers to initiate WhatsApp-based onboarding conversations with candidates directly from the dashboard. An AI agent simulates an employer conversation, gathering onboarding information step by step. The tool also provides a team management view to track candidates and their onboarding status, and a Kanban task board for managing hiring and onboarding tasks.

## Glossary

- **HiringPanel**: The right-side panel component rendered inside LibreChat's SidePanel for the hiring and onboarding tool.
- **Candidate**: A person being considered for employment whose name and WhatsApp number are entered into the tool.
- **OnboardingAgent**: The AI agent that initiates and conducts the WhatsApp conversation with a Candidate on behalf of the employer.
- **TeamManagementView**: The tabular view within HiringPanel listing all Candidates and Employees with their statuses.
- **TaskBoard**: The Kanban-style view within HiringPanel for managing hiring and onboarding tasks across columns: To Do, In Progress, Review, Done.
- **TaskCard**: An individual task item displayed within a TaskBoard column.
- **WhatsApp_Integration**: The backend service responsible for sending and receiving WhatsApp messages via the configured WhatsApp Business API.
- **OnboardingStatus**: The current state of a Candidate's onboarding process — one of: Pending, Onboarding, Active.

---

## Requirements

### Requirement 1: Panel Registration in LibreChat SidePanel

**User Story:** As a LibreChat user, I want the Hiring & Onboarding Tool to appear as a nav icon in the right-side panel, so that I can access it without leaving the chat interface.

#### Acceptance Criteria

1. THE HiringPanel SHALL be registered as a nav link entry in `useSideNavLinks` following the same pattern as `SocialMediaPanel`.
2. WHEN the hiring panel nav icon is clicked, THE HiringPanel SHALL expand and render within the right-side ResizablePanel.
3. WHERE the environment variable `VITE_HIRING_ONBOARDING_TOOL` is set to `"true"`, THE HiringPanel SHALL be visible in the side nav.
4. THE HiringPanel SHALL persist its active tab (TeamManagementView or TaskBoard) in localStorage between sessions.

---

### Requirement 2: Add Candidate Form

**User Story:** As a hiring manager, I want to enter a candidate's name and WhatsApp number, so that I can initiate an onboarding conversation with them.

#### Acceptance Criteria

1. THE HiringPanel SHALL provide an input field for a Candidate's full name.
2. THE HiringPanel SHALL provide an input field for a Candidate's WhatsApp number in international format (e.g., +1234567890).
3. WHEN the hiring manager submits the Add Candidate form, THE HiringPanel SHALL validate that the name field is non-empty and the WhatsApp number matches the pattern `^\+[1-9]\d{7,14}$`.
4. IF the WhatsApp number does not match the required format, THEN THE HiringPanel SHALL display an inline validation error message without submitting the form.
5. WHEN a valid form is submitted, THE HiringPanel SHALL add the Candidate to the TeamManagementView with an initial OnboardingStatus of `Pending`.
6. WHEN a valid form is submitted, THE HiringPanel SHALL invoke the OnboardingAgent to initiate a WhatsApp conversation with the Candidate.

---

### Requirement 3: OnboardingAgent WhatsApp Conversation Initiation

**User Story:** As a hiring manager, I want an AI agent to automatically start a WhatsApp conversation with the candidate, so that onboarding information is gathered without manual effort.

#### Acceptance Criteria

1. WHEN a Candidate is added with status `Pending`, THE OnboardingAgent SHALL send an initial greeting message to the Candidate's WhatsApp number via WhatsApp_Integration.
2. THE OnboardingAgent SHALL conduct the conversation in a step-by-step sequence, requesting one piece of onboarding information per message (e.g., full legal name, date of birth, address, emergency contact, role start date).
3. WHEN the OnboardingAgent sends the first message successfully, THE OnboardingAgent SHALL update the Candidate's OnboardingStatus to `Onboarding`.
4. IF WhatsApp_Integration returns an error when sending a message, THEN THE OnboardingAgent SHALL log the error and set the Candidate's OnboardingStatus back to `Pending`.
5. WHEN the OnboardingAgent has collected all required onboarding fields, THE OnboardingAgent SHALL update the Candidate's OnboardingStatus to `Active`.
6. THE OnboardingAgent SHALL store all collected onboarding responses against the Candidate record in the backend datastore.

---

### Requirement 4: Team Management View

**User Story:** As a hiring manager, I want to see all candidates and employees in a table with their statuses, so that I can track the progress of onboarding at a glance.

#### Acceptance Criteria

1. THE TeamManagementView SHALL display a table with columns: Name, Role, WhatsApp, Status.
2. THE TeamManagementView SHALL render each Candidate's OnboardingStatus as a color-coded badge: `Pending` (yellow), `Onboarding` (blue), `Active` (green).
3. THE TeamManagementView SHALL provide a search input that filters the table rows by Candidate name in real time.
4. WHEN the search input value changes, THE TeamManagementView SHALL filter visible rows to those whose name contains the search string (case-insensitive).
5. THE TeamManagementView SHALL provide a status filter dropdown allowing the user to filter rows by a specific OnboardingStatus or view all.
6. WHEN a status filter is selected, THE TeamManagementView SHALL display only rows matching the selected OnboardingStatus.
7. THE TeamManagementView SHALL provide an "+ Add Employee" button that opens the Add Candidate form.

---

### Requirement 5: Task Board View

**User Story:** As a hiring manager, I want a Kanban task board to manage hiring and onboarding tasks, so that I can track what needs to be done at each stage.

#### Acceptance Criteria

1. THE TaskBoard SHALL display four columns: To Do, In Progress, Review, Done.
2. THE TaskBoard SHALL render TaskCards within the appropriate column based on the task's current status.
3. WHEN a user drags a TaskCard from one column and drops it into another, THE TaskBoard SHALL update the task's status to match the destination column.
4. THE TaskBoard SHALL provide a button to create a new TaskCard, requiring a title at minimum.
5. IF a new TaskCard is submitted without a title, THEN THE TaskBoard SHALL display a validation error and prevent creation.
6. WHEN a TaskCard is created, THE TaskBoard SHALL place it in the `To Do` column by default.

---

### Requirement 6: Tab Navigation Between Views

**User Story:** As a hiring manager, I want to switch between the Team Management view and the Task Board view within the same panel, so that I can access both tools without navigating away.

#### Acceptance Criteria

1. THE HiringPanel SHALL display two tabs: "Team" and "Tasks".
2. WHEN the "Team" tab is selected, THE HiringPanel SHALL render the TeamManagementView.
3. WHEN the "Tasks" tab is selected, THE HiringPanel SHALL render the TaskBoard.
4. THE HiringPanel SHALL default to the "Team" tab on first load.

---

### Requirement 7: Backend API for Candidate Data Persistence

**User Story:** As a hiring manager, I want candidate data to be persisted on the server, so that the team management view is consistent across sessions and devices.

#### Acceptance Criteria

1. THE Backend_API SHALL expose a `POST /api/hiring/candidates` endpoint that accepts `{ name: string, whatsapp: string, role?: string }` and returns the created Candidate record with a generated `id` and `status: "Pending"`.
2. THE Backend_API SHALL expose a `GET /api/hiring/candidates` endpoint that returns an array of all Candidate records.
3. THE Backend_API SHALL expose a `PATCH /api/hiring/candidates/:id` endpoint that accepts partial Candidate fields and returns the updated Candidate record.
4. IF a request to `POST /api/hiring/candidates` is made with a missing `name` or `whatsapp` field, THEN THE Backend_API SHALL return HTTP 400 with a descriptive error message.
5. THE Backend_API SHALL expose a `POST /api/hiring/tasks` endpoint and a `GET /api/hiring/tasks` endpoint for TaskCard CRUD operations.
6. THE Backend_API SHALL expose a `PATCH /api/hiring/tasks/:id` endpoint to update a TaskCard's status or title.

---

### Requirement 8: WhatsApp Integration Configuration

**User Story:** As a system administrator, I want to configure the WhatsApp Business API credentials via environment variables, so that the OnboardingAgent can send messages without hardcoded secrets.

#### Acceptance Criteria

1. THE WhatsApp_Integration SHALL read the WhatsApp Business API token from the environment variable `WHATSAPP_API_TOKEN`.
2. THE WhatsApp_Integration SHALL read the WhatsApp phone number ID from the environment variable `WHATSAPP_PHONE_NUMBER_ID`.
3. IF `WHATSAPP_API_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is not set at server startup, THEN THE WhatsApp_Integration SHALL log a warning and disable WhatsApp message sending without crashing the server.
4. WHERE `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are both set, THE WhatsApp_Integration SHALL use the Meta WhatsApp Cloud API (`https://graph.facebook.com/v18.0/{phone_number_id}/messages`) to send messages.
