<p align="center">
  <img src="frontend/assets/logo.png" alt="Furkan Karabey Logo" width="220">
</p>

# Perraro Support Desk

An omnichannel customer support and ticketing system designed for Perraro Electric Bike operations.

This project collects customer communications from multiple channels, stores them in Supabase, and creates support tickets when needed. It combines automation workflows, database design, file handling, and AI-assisted ticket triage into one support operations system.

---

## Overview

Perraro Support Desk is built to centralize customer conversations that normally arrive from different places such as phone calls, SMS/MMS, email, and website forms.

Instead of handling each channel separately, the system normalizes incoming communication data, matches or creates customer records, stores the interaction history, and creates tickets when a support request needs follow-up.

The current version focuses on the intake and automation layer. The next major phase is an internal support panel where staff can view tickets, read communication history, preview attachments, update ticket status, and reply to customers.

---

## What This Project Solves

Customer support data often gets fragmented across different tools:

- Phone calls stay inside OpenPhone
- SMS and MMS messages are separate from emails
- Website form submissions are not connected to customer history
- Attachments and recordings can take up server storage
- Support requests are hard to track without a ticket system

This project solves that by creating a structured support pipeline:

```txt
Customer communication
        ↓
n8n workflow automation
        ↓
Data normalization and deduplication
        ↓
Supabase customer / communication / ticket records
        ↓
Google Drive attachment storage
        ↓
Future internal support dashboard
```

---

## Current Features

### 1. OpenPhone Call Intake

- Captures inbound and outbound OpenPhone call events
- Normalizes customer phone numbers
- Finds existing customers by normalized phone number
- Creates customer records when no match exists
- Saves call communication records in Supabase
- Prevents duplicate call records using OpenPhone call IDs

### 2. OpenPhone Message Intake

- Captures SMS and MMS messages from OpenPhone
- Normalizes sender and receiver phone numbers
- Finds or creates customer records
- Saves message communication records in Supabase
- Downloads message attachments
- Uploads media files to Google Drive
- Stores attachment metadata and Drive view URLs
- Prevents duplicate message records

### 3. OpenPhone Call Enrichment

- Runs after call intake to enrich existing call records
- Fetches call recordings when available
- Retrieves voicemail data, transcripts, and summaries
- Uploads audio files to Google Drive
- Updates the existing communication record in Supabase
- Stores recording and attachment metadata

### 4. Gmail Email Intake with AI Triage

- Receives incoming Gmail messages
- Uses AI classification to decide whether an email is customer-related
- Determines whether a ticket should be created
- Extracts ticket category, priority, and summary
- Finds or creates customer records by email
- Saves email communications in Supabase
- Creates tickets when needed
- Uploads email attachments to Google Drive

### 5. Website Ticket Intake

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
| Workflow Automation | n8n |
| Database | Supabase / PostgreSQL |
| Phone, SMS, MMS | OpenPhone |
| Email Intake | Gmail |
| AI Classification | OpenAI |
| File Storage | Google Drive |
| Website Form | Shopify Custom Liquid |
| Planned Backend | Express.js + TypeScript |
| Planned Frontend | Support dashboard / ticket inbox |

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

OpenPhone SMS / MMS
   ↓
OpenPhone Message Intake Workflow
   ↓
Supabase: customers + communications
   ↓
Google Drive: media attachments
   ↓
Supabase: attachments

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
Supabase: attachments

Website Ticket Form
   ↓
Website Ticket Intake Workflow
   ↓
Supabase: customers + tickets + communications
   ↓
Google Drive: uploaded files
   ↓
Supabase: attachments
```

For a more detailed explanation, see [`docs/architecture.md`](docs/architecture.md).

---

## Project Structure

```txt
perraro-ticketing-system/
│
├── README.md
├── .gitignore
├── .env.example
│
├── docs/
│   └── architecture.md
│
├── database/
│   └── schema.sql
│
├── n8n-workflows/
│   ├── 001-openphone-call-intake.json
│   ├── 002-openphone-message-intake.json
│   ├── 003-openphone-call-enrichment.json
│   ├── 004-email-intake.json
│   └── 005-website-ticket-intake.json
│
└── frontend/
    └── website ticket form / Shopify Custom Liquid assets
```

> Note: The repository currently focuses on workflow exports, database structure, and project documentation. The internal support panel is planned as a separate backend/frontend phase.

---

## Environment Variables

The repository includes an example environment file:

```txt
.env.example
```

It documents the required configuration for:

- Supabase
- JWT authentication for the planned backend
- Initial admin user setup
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

---

## Current Status

The current version includes the automation and data intake layer.

Completed:

- OpenPhone call intake workflow
- OpenPhone message intake workflow
- OpenPhone call enrichment workflow
- Gmail email intake workflow with AI triage
- Website ticket intake workflow
- Supabase schema snapshot
- Google Drive attachment storage strategy
- Architecture documentation

Planned:

- Express.js + TypeScript backend
- Authentication and admin login
- Ticket inbox API
- Ticket detail API
- Customer profile API
- Communication history API
- Attachment preview support
- SMS reply through OpenPhone
- Email reply through SMTP or Gmail
- Ticket status, priority, and assignment management
- Internal notes
- Ticket closure flow
- Frontend support dashboard

---

## Roadmap

### Phase 1 — Automation Layer

- [x] OpenPhone call intake
- [x] OpenPhone SMS/MMS intake
- [x] Call enrichment workflow
- [x] Email intake with AI triage
- [x] Website ticket form intake
- [x] Attachment upload flow

### Phase 2 — Database Hardening

- [ ] Add foreign key constraints
- [ ] Add unique indexes for external IDs and ticket numbers
- [ ] Add status and priority constraints
- [ ] Add updated_at triggers
- [ ] Add seed/demo data for portfolio presentation

### Phase 3 — Backend API

- [ ] Create Express.js + TypeScript backend
- [ ] Add authentication
- [ ] Add ticket list and detail endpoints
- [ ] Add customer detail endpoints
- [ ] Add communication history endpoints
- [ ] Add ticket update endpoints

### Phase 4 — Internal Support Panel

- [ ] Ticket inbox UI
- [ ] Ticket detail page
- [ ] Customer profile panel
- [ ] Communication timeline
- [ ] Attachment preview modal
- [ ] Reply by SMS/email
- [ ] Internal notes

---

## Why This Project Matters

This project is not only a simple ticket form. It is a real-world support operations system that connects multiple business tools into a single structured workflow.

It demonstrates:

- Workflow automation design
- API integration thinking
- Customer and ticket data modeling
- Supabase/PostgreSQL usage
- File handling and external storage strategy
- AI-assisted email triage
- Practical support operations architecture
- Separation between automation workflows and future application backend

---

## Author

**Furkan Karabey**

Backend, infrastructure, and automation-focused developer building real-world business systems with APIs, databases, workflow automation, and cloud/server infrastructure.
