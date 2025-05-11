# Human-in-the-Loop AI Supervisor System

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture & Design](#architecture--design)
2a. [Deep Technical Architecture Overview](#deep-technical-architecture-overview)
3. [Setup & Installation](#setup--installation)
4. [Backend (API) Details](#backend-api-details)
5. [Frontend: Client App](#frontend-client-app)
6. [Frontend: Admin/Supervisor App](#frontend-adminsupervisor-app)
7. [Database Schema & Migrations](#database-schema--migrations)
8. [LiveKit Integration](#livekit-integration)
9. [Escalation & Help Request Flow](#escalation--help-request-flow)
10. [Knowledge Base System](#knowledge-base-system)
11. [Room Events & Auditing](#room-events--auditing)
12. [Error Handling & Reliability](#error-handling--reliability)
13. [Extensibility & Future Improvements](#extensibility--future-improvements)


---

## 1. Project Overview

This project implements a **human-in-the-loop AI supervisor system** for a simulated salon. The system allows an AI agent to handle customer queries, escalate to a human supervisor when needed, and continuously learn from supervisor responses. It is designed for reliability, modularity, and extensibility, and demonstrates best practices in full-stack engineering.

**Key Features:**
- Real-time customer-agent communication (LiveKit)
- Escalation to human supervisor for unknown queries
- Supervisor/admin panel for managing help requests and knowledge base
- Persistent knowledge base that grows with supervisor input
- Room event tracking for auditability

---

## 2. Architecture & Design

### High-Level Diagram

```
+-------------------+      +-------------------+      +-------------------+
|   Client (React)  |<---->|    Backend/API    |<---->|   Admin (React)   |
|  (Salon Customer) |      | (Node.js/Express) |      | (Supervisor UI)   |
+-------------------+      +-------------------+      +-------------------+
         |                        |  |                        |
         |                        v  v                        |
         |                 +-------------------+              |
         |                 |   PostgreSQL DB   |              |
         |                 +-------------------+              |
         |                        |                            |
         |                        v                            |
         |                 +-------------------+               |
         +---------------> |    LiveKit Cloud  | <-------------+
                           +-------------------+
```

### Key Components
- **Client App:** End-user interface for salon customers to chat with the AI agent.
- **Backend/API:** Handles business logic, escalation, database, and LiveKit integration.
- **Admin App:** Supervisor UI for resolving help requests and managing the knowledge base.
- **Database:** Stores help requests, knowledge base, and room events.
- **LiveKit:** Provides real-time communication channels.

### Design Principles
- **Separation of Concerns:** Each app (client, admin, backend) is a separate project.
- **Extensibility:** Modular code for easy feature addition (e.g., authentication, analytics).
- **Reliability:** Handles errors gracefully, supports supervisor timeouts, and ensures data integrity.
- **Auditability:** All room events and escalations are logged.

---

## 2a. Deep Technical Architecture Overview

### System Architecture (Technical Deep Dive)

#### Component Breakdown
- **Client App (React 19, TypeScript):**
  - Handles customer chat UI, session management, and LiveKit real-time communication.
  - Communicates with backend via REST API and LiveKit WebSocket.
  - State managed via React hooks and context; error/loading states handled at component level.
- **Admin App (React 19, TypeScript):**
  - Supervisor dashboard for help requests, knowledge base, and room event logs.
  - Uses REST API for CRUD operations and LiveKit for real-time updates (future: WebSocket for push updates).
- **Backend/API (Node.js, Express, TypeScript):**
  - REST API endpoints for agent, supervisor, help requests, knowledge base, and room events.
  - Business logic in `src/services/`, event-driven decoupling via `src/eventBus.ts`.
  - Integrates with LiveKit via API and WebSocket for real-time room management.
  - Uses Prisma ORM for database access and migrations.
- **Database (PostgreSQL, Prisma):**
  - Stores help requests, knowledge base, and room events.
  - Enforces data integrity and transactional writes.
- **LiveKit (Cloud or Self-hosted):**
  - Provides real-time audio/video/data channels for chat rooms.
  - Backend authenticates and manages rooms, participants, and event logging.

#### Technology Stack
- **Frontend:** React 19, TypeScript, CSS Modules
- **Backend:** Node.js 18+, Express, TypeScript, Prisma ORM
- **Database:** PostgreSQL (local or managed)
- **Real-time:** LiveKit Cloud (WebSocket, REST API)
- **DevOps:** `.env` for config, Prisma migrations, npm scripts

#### Architecture Diagram (Mermaid)
```mermaid
graph TD
  subgraph Frontend
    Client[Client App]
    Admin[Admin App]
  end
  subgraph Backend
    API[Express API]
    EventBus[Event Bus]
    Services[Business Logic]
    Prisma[Prisma ORM]
  end
  DB[(PostgreSQL DB)]
  LiveKit[LiveKit Cloud]

  Client -- REST/API --> API
  Admin -- REST/API --> API
  API -- Prisma --> DB
  API -- EventBus --> Services
  API -- LiveKit API --> LiveKit
  Client -- LiveKit WS --> LiveKit
  Admin -- LiveKit WS --> LiveKit
  LiveKit -- Webhook/Event --> API
```

### Data Flow

#### Help Request Lifecycle
1. **Customer submits question** via Client App → POST `/api/agent/message`.
2. **Backend (Agent Service):**
   - Checks knowledge base for answer (fuzzy match).
   - If found, responds immediately.
   - If not, escalates:
     - Creates `HelpRequest` in DB (status: pending).
     - Notifies supervisor via Admin App (polling or future: WebSocket push).
3. **Supervisor (Admin App):**
   - Views pending requests, submits answer via `/api/help-requests/:id/reply`.
   - Backend updates `HelpRequest` (status: resolved), creates/updates `KnowledgeBaseEntry`.
   - Notifies original customer via LiveKit room event.
4. **Room Events:**
   - All join/leave/message events logged in `RoomEvent` table for auditability.

#### Knowledge Base Update
- When supervisor answers, backend stores Q&A in `KnowledgeBaseEntry`.
- Future similar questions are auto-answered by agent using fuzzy search.

#### Real-Time Communication
- LiveKit rooms are created per help session.
- Client, agent, and supervisor join as participants.
- Messages and events are exchanged via LiveKit DataTracks and logged.

### Control Flow

#### Escalation Logic
- If agent cannot answer (no KB match, low confidence), triggers escalation:
  - Creates help request (pending).
  - Notifies supervisor.
  - Sets timeout for supervisor response (configurable, e.g., 2 minutes).
- If supervisor responds in time:
  - Marks request as resolved, notifies customer, updates KB.
- If timeout:
  - Marks request as unresolved, notifies customer, logs event.

#### Error Handling & Reliability
- All API routes use async error handlers (try/catch, Express middleware).
- Database/network errors are logged and surfaced in UI.
- Supervisor timeouts handled via scheduled jobs (Node cron or setTimeout).
- All writes are transactional (Prisma).
- Room events are always logged for audit/debug.

### Security & Auditability
- **Authentication/Authorization:** (Planned) JWT or session-based for admin/supervisor.
- **Data Integrity:** Enforced via Prisma schema, unique constraints, and transactional writes.
- **Audit Logs:** All room events, escalations, and supervisor actions are logged.
- **Environment Variables:** Secrets (DB, LiveKit) managed via `.env` and not committed.

### Extensibility & Scaling
- **Add new features:**
  - Backend: Add new service, route, or event handler.
  - Frontend: Add new component/page, update API calls.
- **Scale components:**
  - Backend and DB can be containerized and deployed independently.
  - LiveKit can be scaled via cloud or self-hosted clusters.
- **Multi-tenancy:**
  - Add tenantId to DB models, partition data by salon/client.
- **Analytics:**
  - Add event tracking, response time metrics, escalation rates.

### Key File References
- `src/app.ts`: Express app entry point
- `src/routes/`: API endpoints
- `src/services/`: Business logic (agent, supervisor, KB)
- `src/models/`: Data models
- `src/eventBus.ts`: Event-driven decoupling
- `prisma/schema.prisma`: DB schema
- `client/src/HelpRequest.tsx`: Customer chat UI
- `admin/src/PendingRequests.tsx`: Supervisor dashboard

---

## 3. Setup & Installation

### Prerequisites
- Node.js 16+
- PostgreSQL (local or Neon.tech)
- [LiveKit Cloud](https://livekit.io/) or self-hosted LiveKit server

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/frondesk-assignment.git
cd frondesk-assignment
```

### 2. Install Dependencies
```bash
npm install
cd client && npm install
cd ../admin && npm install
```

### 3. Environment Variables
- Copy `.env.example` to `.env` in the root and fill in your database and LiveKit details.
- For `client/` and `admin/`, create `.env.local` with API and LiveKit URLs.

Example `.env` for backend:
```
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
LIVEKIT_API_KEY=your_livekit_key
LIVEKIT_API_SECRET=your_livekit_secret
LIVEKIT_WS_URL=wss://your-livekit-url
```

Example `.env.local` for client/admin:
```
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_LIVEKIT_WS_URL=wss://your-livekit-url
```

### 4. Database Setup
```bash
npx prisma migrate dev
npx prisma generate
```

### 5. Start the Backend
```bash
npm run dev
```

### 6. Start the Client and Admin Apps
```bash
cd client && npm start
# In a new terminal:
cd ../admin && npm start
```

---

## 4. Backend (API) Details

- **Framework:** Node.js, Express, TypeScript
- **ORM:** Prisma
- **Key Files:**
  - `src/app.ts`: Main server entry point
  - `src/routes/`: API endpoints (agent, supervisor, etc.)
  - `src/services/`: Business logic (agent, supervisor, knowledge base)
  - `src/models/`: Data models
  - `src/eventBus.ts`: Event-driven architecture for decoupling
- **API Endpoints:**
  - `/api/agent/call`: Start a new call/session
  - `/api/agent/message`: Send/receive messages
  - `/api/help-requests`: CRUD for help requests
  - `/api/kb`: CRUD for knowledge base
  - `/api/room-events`: Room event logs

### Error Handling
- All endpoints use async error handlers
- Graceful fallback for database/network errors
- Supervisor timeouts handled via scheduled jobs

---

## 5. Frontend: Client App

- **Framework:** React 19, TypeScript
- **Key Features:**
  - Chat interface for salon customers
  - Real-time updates via LiveKit
  - Connection status, loading, and error states
  - Consistent styling with CSS classes (matches admin)
- **Key Files:**
  - `src/HelpRequest.tsx`: Main chat UI
  - `src/App.css`: Shared styles

### How It Works
- User enters their name/phone and starts a session
- Messages are sent to the backend and relayed via LiveKit
- If the AI cannot answer, it escalates to a supervisor
- User is notified when a supervisor responds

---

## 6. Frontend: Admin/Supervisor App

- **Framework:** React 19, TypeScript
- **Key Features:**
  - View/manage pending help requests
  - Submit answers to resolve requests
  - View history of resolved/unresolved requests
  - Manage knowledge base (add/delete answers)
  - View room events for auditing
- **Key Files:**
  - `src/PendingRequests.tsx`: Pending help requests
  - `src/LearnedAnswers.tsx`: Knowledge base management
  - `src/RoomEvents.tsx`: Room event logs

### Supervisor Workflow
1. See all pending help requests
2. Click "Reply" to answer a request
3. Answer is sent to the backend, which notifies the original caller
4. Supervisor can add or delete knowledge base entries

---

## 7. Database Schema & Migrations

- **ORM:** Prisma
- **Schema:** See `prisma/schema.prisma`
- **Key Tables:**
  - `HelpRequest`: Tracks all escalations (pending, resolved, unresolved)
  - `KnowledgeBaseEntry`: Stores learned answers
  - `RoomEvent`: Logs all LiveKit room events

### Example Schema (simplified)
```prisma
model HelpRequest {
  id        String   @id @default(uuid())
  question  String
  callerId  String
  status    HelpRequestStatus
  createdAt DateTime @default(now())
  resolvedAt DateTime?
  supervisorResponse String?
  knowledgeBaseEntry KnowledgeBaseEntry? @relation(fields: [knowledgeBaseEntryId], references: [id])
  knowledgeBaseEntryId String? @unique
}

model KnowledgeBaseEntry {
  id        String   @id @default(uuid())
  question  String
  answer    String
  createdAt DateTime @default(now())
  source    String
  helpRequest HelpRequest?
}

model RoomEvent {
  id        String   @id @default(uuid())
  roomName  String
  eventType String
  participantId String?
  participantName String?
  data      String?
  createdAt DateTime @default(now())
}
```

---

## 8. LiveKit Integration

- **Purpose:** Real-time communication between client, agent, and supervisor
- **How Used:**
  - Each help session is a LiveKit room
  - Client and agent join the room for messaging
  - Room events (join, leave, message) are logged
- **Configuration:**
  - Set `LIVEKIT_WS_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in `.env`
- **Agent Bot:**
  - Polls for new messages and responds in real time
  - Handles multiple rooms simultaneously

---

## 9. Escalation & Help Request Flow

### Sequence Diagram
```
Customer         Agent (AI)         Backend/API         Supervisor
   |                 |                  |                   |
   |  Ask question   |                  |                   |
   |---------------->|                  |                   |
   |                 |  Can't answer    |                   |
   |                 |----------------->|                   |
   |                 |                  |  Create help req  |
   |                 |                  |------------------>| (admin UI)
   |                 |                  |                   |
   |                 |                  |  Wait for reply   |
   |                 |                  |<------------------|
   |                 |  Get answer      |                   |
   |  Notify user    |<-----------------|                   |
   |<----------------|                  |                   |
```

### Request Lifecycle
- **Pending:** Awaiting supervisor response
- **Resolved:** Supervisor answered
- **Unresolved:** Timed out or closed without answer

---

## 10. Knowledge Base System

- **Purpose:** Store supervisor answers for future use
- **How It Works:**
  - When a supervisor answers, the answer is saved to the knowledge base
  - Future similar questions are answered automatically
- **Admin UI:**
  - Add new entries manually
  - Delete incorrect/outdated entries
- **Backend:**
  - Uses fuzzy matching to find similar questions

---

## 11. Room Events & Auditing

- **All LiveKit room events are logged** (room started, participant joined/left, etc.)
- **Admin UI:**
  - View paginated event logs
- **Purpose:**
  - Auditability
  - Debugging
  - Analytics

---

## 12. Error Handling & Reliability

- **Backend:**
  - All API routes use async error handlers
  - Supervisor timeouts handled via scheduled jobs
  - Database/network errors are logged and surfaced in the UI
- **Frontend:**
  - User-friendly error messages
  - Loading and disabled states for all actions
- **Database:**
  - All writes are transactional
  - Data integrity enforced via Prisma schema

---

## 13. Extensibility & Future Improvements

- **Authentication:** Add user/supervisor login
- **Real-time updates:** Use WebSockets for admin panel
- **Analytics:** Track response times, escalation rates
- **Mobile support:** Responsive UI for all devices
- **Multi-tenant:** Support multiple salons/clients
- **AI improvements:** Use LLMs for better answer matching

---

## 14. Developer Notes & FAQ

### Q: How do I reset the database?
A: Run `npx prisma migrate reset` (will erase all data).

### Q: How do I add a new feature?
A: Add a new route/service in the backend, and update the relevant frontend/admin UI.

### Q: How do I debug LiveKit issues?
A: Check the room events log in the admin panel, and use LiveKit's dashboard for diagnostics.

### Q: How do I deploy this?
A: Deploy backend (Node.js) and both frontends (React) to your preferred cloud provider. Use managed Postgres (e.g., Neon.tech) and LiveKit Cloud for best results.

---

