# Support Desk

An omnichannel customer support and ticketing system that centralizes customer conversations, support requests, attachments, and ticket records in one structured workflow.

This project combines a TypeScript backend, React frontend, Supabase/PostgreSQL database, n8n workflow automation, OpenPhone, Gmail, Google Drive, and AI-assisted email triage.

---

## Overview

Support Desk is designed to collect customer communications from multiple channels such as phone calls, SMS/MMS, email, and website forms.

Instead of leaving support data scattered across different tools, the system normalizes incoming communication data, matches or creates customer records, stores interaction history, and creates tickets when follow-up is needed.

The project includes both the application layer and the automation layer:

- **Backend API** for authentication, tickets, customers, records, search, dashboard data, attachments, and actions
- **Frontend dashboard** for viewing and managing support operations
- **n8n workflows** for ingesting external communication events and storing structured records
- **Supabase/PostgreSQL schema** for customer, ticket, communication, and attachment data

---

## What This Project Solves

Customer support data often gets fragmented across different tools:

- Phone calls stay inside phone systems
- SMS and MMS messages are separate from emails
- Website form submissions are not connected to customer history
- Attachments and recordings can take up server storage
- Support requests are hard to track without a ticket system
- Staff need a single place to search customers, tickets, and communication records

This project solves that by creating a structured support pipeline:

```txt
Customer communication
        ↓
n8n workflow automation / backend API
        ↓
Data normalization and deduplication
        ↓
Supabase customer / communication / ticket records
        ↓
Google Drive attachment storage
        ↓
Internal support dashboard
```

---

## Current Features

### 1. Backend API

- Express.js + TypeScript backend structure
- Supabase client configuration
- JWT-based authentication middleware
- Admin user creation script
- Admin password reset script
- Modular route files for each major resource
- Pagination and validation utilities
- Environment-based configuration

### 2. Frontend Dashboard

- React + TypeScript frontend
- Vite project structure
- Login page
- Dashboard page
- Tickets page
- Customers page
- Customer detail page
- Search page
- Email records page
- OpenPhone records page
- Record detail page
- Attachments page
- Users page
- Shared API client structure
- Reusable app layout and message composer components

### 3. OpenPhone Call Intake

- Captures inbound and outbound OpenPhone call events
- Normalizes customer phone numbers
- Finds existing customers by normalized phone number
- Creates customer records when no match exists
- Saves call communication records in Supabase
- Prevents duplicate call records using OpenPhone call IDs

### 4. OpenPhone Message Intake

- Captures SMS and MMS messages from OpenPhone
- Normalizes sender and receiver phone numbers
- Finds or creates customer records
- Saves message communication records in Supabase
- Downloads message attachments
- Uploads media files to Google Drive
- Stores attachment metadata and Drive view URLs
- Prevents duplicate message records

### 5. OpenPhone Call Enrichment

- Runs after call intake to enrich existing call records
- Fetches call recordings when available
- Retrieves voicemail data, transcripts, and summaries
- Uploads audio files to Google Drive
- Updates the existing communication record in Supabase
- Stores recording and attachment metadata

### 6. Gmail Email Intake with AI Triage

- Receives incoming Gmail messages
- Uses AI classification to decide whether an email is customer-related
- Determines whether a ticket should be created
- Extracts ticket category, priority, and summary
- Finds or creates customer records by email
- Saves email communications in Supabase
- Creates tickets when needed
- Uploads email attachments to Google Drive

### 7. Website Ticket Intake

- Receives customer support requests from a website form
- Supports multipart form submissions with file attachments
- Finds or creates customers by email and phone number
- Creates a support ticket
- Saves the first website message as a communication record
- Uploads attachments to Google Drive
- Returns a ticket number to the customer-facing form

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js, Express.js, TypeScript |
| Frontend | React, TypeScript, Vite |
| Database | Supabase / PostgreSQL |
| Workflow Automation | n8n |
| Phone, SMS, MMS | OpenPhone |
| Email Intake | Gmail |
| AI Classification | OpenAI |
| File Storage | Google Drive |
| Website Form | Shopify Custom Liquid |
| Authentication | JWT |

---

## Architecture

The system is designed around four core database entities:

### Customers

Stores customer identity and contact information.

Typical fields:

- Full name
- Primary and secondary email
- Primary and secondary phone
- Normalized phone numbers
- Notes
- Source

### Tickets

Stores support cases that require follow-up.

Typical fields:

- Ticket number
- Customer ID
- Title and description
- Category
- Priority
- Status
- Source
- Last activity time

### Communications

Stores every interaction with a customer, whether or not it creates a ticket.

Examples:

- Phone call
- SMS
- MMS
- Email
- Website form submission
- Voicemail
- Future outbound replies

### Attachments

Stores metadata for files related to communications and tickets.

Files are uploaded to Google Drive. Supabase stores metadata such as:

- File name
- MIME type
- File size
- Drive view URL
- Communication ID
- Ticket ID
- Customer ID

---

## High-Level Data Flow

```txt
OpenPhone Calls
   ↓
OpenPhone Call Intake Workflow
   ↓
Supabase: customers + communications
   ↓
Backend API
   ↓
Frontend Dashboard

OpenPhone SMS / MMS
   ↓
OpenPhone Message Intake Workflow
   ↓
Supabase: customers + communications
   ↓
Google Drive: media attachments
   ↓
Supabase: attachments
   ↓
Frontend Dashboard

Gmail Emails
   ↓
Email Intake Workflow
   ↓
AI classification and triage
   ↓
Supabase: customers + communications + tickets
   ↓
Google Drive: email attachments
   ↓
Frontend Dashboard

Website Ticket Form
   ↓
Website Ticket Intake Workflow
   ↓
Supabase: customers + tickets + communications
   ↓
Google Drive: uploaded files
   ↓
Frontend Dashboard
```

For a more detailed explanation, see [`docs/architecture.md`](docs/architecture.md).

---

## Project Structure

```txt
ticketing-system/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── supabase.ts
│   │   ├── constants/
│   │   ├── middleware/
│   │   │   └── auth.middleware.ts
│   │   ├── routes/
│   │   │   ├── actions.routes.ts
│   │   │   ├── attachments.routes.ts
│   │   │   ├── auth.routes.ts
│   │   │   ├── communications.routes.ts
│   │   │   ├── customers.routes.ts
│   │   │   ├── dashboard.routes.ts
│   │   │   ├── records.routes.ts
│   │   │   ├── search.routes.ts
│   │   │   ├── tickets.routes.ts
│   │   │   └── users.routes.ts
│   │   ├── scripts/
│   │   │   ├── create-admin.ts
│   │   │   └── reset-admin-password.ts
│   │   ├── utils/
│   │   │   ├── pagination.ts
│   │   │   └── validation.ts
│   │   └── server.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── actions.ts
│   │   │   ├── client.ts
│   │   │   ├── customers.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── records.ts
│   │   │   └── tickets.ts
│   │   ├── assets/
│   │   │   └── supportdesk-logo.jpg
│   │   ├── components/
│   │   │   ├── AppLayout.tsx
│   │   │   └── MessageComposer.tsx
│   │   ├── pages/
│   │   │   ├── AttachmentsPage.tsx
│   │   │   ├── CustomerDetailPage.tsx
│   │   │   ├── CustomersPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── EmailRecordsPage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── OpenPhoneRecordsPage.tsx
│   │   │   ├── RecordDetailPage.tsx
│   │   │   ├── SearchPage.tsx
│   │   │   ├── TicketsPage.tsx
│   │   │   └── UsersPage.tsx
│   │   ├── types/
│   │   │   ├── auth.ts
│   │   │   ├── customer.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── record.ts
│   │   │   └── ticket.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── database/
│   └── schema.sql
│
├── docs/
│   ├── architecture.md
│   └── shopify-form/
│
├── n8n-workflows/
│   ├── 001-openphone-call-intake.json
│   ├── 002-openphone-message-intake.json
│   ├── 003-openphone-call-enrichment.json
│   ├── 004-email-intake.json
│   └── 005-website-ticket-intake.json
│
├── .env.example
├── .gitignore
└── README.md
```

---

## Backend Modules

The backend is organized into route-based modules:

| Module | Purpose |
| --- | --- |
| `auth.routes.ts` | Login and authentication flow |
| `tickets.routes.ts` | Ticket list, detail, and updates |
| `customers.routes.ts` | Customer list and customer detail data |
| `communications.routes.ts` | Communication records connected to customers and tickets |
| `records.routes.ts` | Unified communication record views |
| `dashboard.routes.ts` | Dashboard metrics and summary data |
| `attachments.routes.ts` | Attachment metadata and file references |
| `actions.routes.ts` | Operational actions such as replies or status changes |
| `search.routes.ts` | Global search across support data |
| `users.routes.ts` | Internal user/admin management |

---

## Frontend Pages

The frontend includes a dashboard-style support interface:

| Page | Purpose |
| --- | --- |
| `LoginPage.tsx` | Admin login screen |
| `DashboardPage.tsx` | Support overview and metrics |
| `TicketsPage.tsx` | Ticket inbox/list view |
| `CustomersPage.tsx` | Customer list |
| `CustomerDetailPage.tsx` | Customer profile and history |
| `EmailRecordsPage.tsx` | Email communication records |
| `OpenPhoneRecordsPage.tsx` | Call/SMS-related records |
| `RecordDetailPage.tsx` | Detailed communication record view |
| `AttachmentsPage.tsx` | Uploaded attachment records |
| `SearchPage.tsx` | Global search page |
| `UsersPage.tsx` | Internal users/admin page |

---

## Environment Variables

The repository includes example environment files for both the root/backend configuration.

The backend environment configuration covers:

- Supabase URL and service role key
- JWT secret and token expiration
- Initial admin user setup
- Admin password reset configuration
- OpenPhone API access
- SMTP email sending
- CORS origins

Never commit real API keys, service role keys, webhook secrets, SMTP passwords, or production credentials.

---

## Security Principles

This project follows these security rules:

- Credentials are not committed to the repository
- API keys must be configured through environment variables or platform credentials
- n8n workflow exports should be sanitized before publication
- Google Drive folder IDs should be replaced with placeholders when needed
- Production webhook URLs should be reviewed before public release
- Supabase service role keys should only be used on trusted backend or automation environments
- Authentication-protected routes should go through JWT middleware

---

## Current Status

Completed:

- Backend project structure
- Express.js + TypeScript setup
- Supabase backend configuration
- Authentication middleware
- Auth, tickets, customers, records, dashboard, search, users, attachments, communications, and actions route modules
- Admin creation and password reset scripts
- React + TypeScript frontend setup
- Dashboard, tickets, customers, records, search, attachments, users, and login pages
- Shared frontend API client structure
- OpenPhone call intake workflow
- OpenPhone message intake workflow
- OpenPhone call enrichment workflow
- Gmail email intake workflow with AI triage
- Website ticket intake workflow
- Supabase schema snapshot
- Google Drive attachment storage strategy
- Architecture documentation

In progress / planned:

- Production deployment
- Final backend endpoint hardening
- Full dashboard polish
- Role-based authorization
- More complete database constraints and indexes
- Demo screenshots/GIFs for README
- Test data and seed scripts
- CI/CD workflow

---

## Roadmap

### Phase 1 — Automation Layer

- [x] OpenPhone call intake
- [x] OpenPhone SMS/MMS intake
- [x] Call enrichment workflow
- [x] Email intake with AI triage
- [x] Website ticket form intake
- [x] Attachment upload flow

### Phase 2 — Application Layer

- [x] Express.js + TypeScript backend structure
- [x] React + TypeScript frontend structure
- [x] Authentication middleware
- [x] Modular route structure
- [x] Dashboard and support pages
- [ ] Finalize all API response contracts
- [ ] Add complete error handling strategy
- [ ] Add loading and empty states on the frontend

### Phase 3 — Database Hardening

- [ ] Add foreign key constraints
- [ ] Add unique indexes for external IDs and ticket numbers
- [ ] Add status and priority constraints
- [ ] Add updated_at triggers
- [ ] Add seed/demo data for portfolio presentation

### Phase 4 — Production Readiness

- [ ] Add deployment documentation
- [ ] Add Docker setup
- [ ] Add environment setup guide
- [ ] Add screenshots and demo walkthrough
- [ ] Add CI/CD checks
- [ ] Add basic automated tests

---

## Why This Project Matters

This project is not only a simple ticket form. It is a real-world support operations system that connects multiple business tools into a single structured workflow.

It demonstrates:

- Backend API design
- React dashboard development
- Workflow automation design
- API integration thinking
- Customer and ticket data modeling
- Supabase/PostgreSQL usage
- File handling and external storage strategy
- AI-assisted email triage
- Authentication and admin workflow design
- Separation between automation workflows, backend API, frontend dashboard, and database schema

---

## Author

**Furkan Karabey**

Backend, infrastructure, and automation-focused developer building real-world business systems with APIs, databases, workflow automation, and cloud/server infrastructure.
