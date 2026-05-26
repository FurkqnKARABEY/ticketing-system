<p align="center">
  <img src="frontend/assets/logo.png" alt="Furkan Karabey Logo" width="220">
</p>

# Support Desk

An omnichannel customer support and ticketing system.

This project collects customer communications from multiple channels, stores them in Supabase, and creates support tickets when needed.

---

## Current Features

### 1. OpenPhone Call Intake
- Captures inbound and outbound calls from OpenPhone
- Normalizes customer phone numbers
- Finds or creates customer records
- Saves call communication records in Supabase
- Prevents duplicate call entries

### 2. OpenPhone Message Intake
- Captures SMS and MMS messages
- Normalizes phone numbers
- Finds or creates customers
- Saves messages in Supabase
- Downloads message attachments
- Uploads files to Google Drive
- Stores attachment metadata and Drive view URLs

### 3. OpenPhone Call Enrichment
- Fetches call recordings
- Retrieves transcripts and summaries when available
- Saves voicemail, transcript, and summary data
- Uploads audio files to Google Drive
- Updates existing communication records

### 4. Email Intake with AI Triage
- Receives incoming Gmail messages
- Uses AI classification to determine:
  - Whether the email is customer-related
  - Whether a ticket should be created
  - Ticket category
  - Priority
  - Summary
- Finds or creates customer records by email
- Saves email communications
- Creates tickets when necessary
- Uploads email attachments to Google Drive

### 5. Website Ticket Intake
- Receives ticket submissions from a website form
- Supports multipart form submissions with file attachments
- Finds or creates customers by email and phone
- Creates support tickets and first communication records
- Uploads attachments to Google Drive
- Returns ticket number to the customer-facing form

---

## Project Structure

```txt
support-desk/
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
    └── website-ticket-form-shopify.liquid
