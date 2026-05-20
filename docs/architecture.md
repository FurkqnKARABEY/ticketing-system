# Perraro Ticketing System Architecture

## Overview

The Perraro Ticketing System is an omnichannel customer support platform designed to collect customer communications from multiple sources, store them in a structured database, and create support tickets when necessary.

The system currently uses:

- n8n for workflow automation
- Supabase for database storage
- OpenPhone for calls, SMS, and MMS
- Gmail for incoming customer emails
- Google Drive for attachment and recording storage
- OpenAI for email classification and ticket triage
- Shopify Custom Liquid for the website ticket submission form

---

## High-Level Data Flow

```txt
OpenPhone Calls
       ↓
n8n Workflow 001
       ↓
Supabase: customers + communications


OpenPhone SMS / MMS
       ↓
n8n Workflow 002
       ↓
Supabase: customers + communications
       ↓
Google Drive: media attachments
       ↓
Supabase: attachments


OpenPhone Call Enrichment
       ↓
n8n Workflow 003
       ↓
OpenPhone recording / transcript / summary data
       ↓
Google Drive: audio files
       ↓
Supabase: updated communications + attachments


Incoming Gmail Emails
       ↓
n8n Workflow 004
       ↓
AI customer/ticket classification
       ↓
Supabase: customers + communications + tickets
       ↓
Google Drive: email attachments
       ↓
Supabase: attachments


Website Ticket Form
       ↓
n8n Workflow 005
       ↓
Supabase: customers + tickets + communications
       ↓
Google Drive: uploaded files
       ↓
Supabase: attachments

Core Database Entities
1. Customers

Stores customer identity information such as:

Name
Email
Phone number
Creation date

Customers are matched primarily by:

Email address for email and website ticket submissions
Normalized phone number for OpenPhone calls and messages
2. Tickets

Stores support request records such as:

Ticket number
Customer ID
Category
Priority
Status
Summary
Source
Creation date

Tickets are created from:

AI-classified incoming emails when a ticket is needed
Website support form submissions
3. Communications

Stores all customer interactions, including:

Phone calls
SMS messages
MMS messages
Emails
Website form submissions
Future outbound replies

Each communication can be linked to:

A customer
A ticket, when applicable
4. Attachments

Stores metadata for files connected to communications, such as:

Images
Videos
PDFs
Audio recordings
Voicemails
Email attachments
Website form uploads

Files are stored in Google Drive, while Supabase stores:

File name
MIME type
Drive URL
Communication ID
Ticket ID when applicable
Workflow Architecture
Workflow 001: OpenPhone Call Intake

Purpose:

Capture inbound and outbound OpenPhone call events
Normalize customer phone number
Find or create the customer
Save a communication record
Prevent duplicate records using OpenPhone call ID
Workflow 002: OpenPhone Message Intake

Purpose:

Capture incoming and outgoing SMS/MMS messages
Normalize phone number
Find or create the customer
Save the communication
Process message attachments
Upload media to Google Drive
Create attachment records in Supabase
Prevent duplicates using OpenPhone message ID
Workflow 003: OpenPhone Call Enrichment

Purpose:

Run on a schedule and enrich previously saved call communications
Fetch call recordings, transcripts, summaries, and voicemail data
Store transcript and summary in Supabase
Upload recording or voicemail audio to Google Drive
Create corresponding attachment records
Update communication details
Workflow 004: Email Intake

Purpose:

Receive incoming Gmail messages
Normalize email data
Use AI to classify:
Is it customer-related?
Does it require a ticket?
Category
Priority
Summary
Deduplicate by Gmail message ID
Find or create the customer by email
Save the email as a communication
Create a ticket when needed
Link communication to ticket
Upload attachments to Google Drive
Save attachment metadata in Supabase
Workflow 005: Website Ticket Intake

Purpose:

Receive customer ticket submissions from the Shopify website
Accept multipart form data and attachments
Find or create customer by email and phone
Create a ticket
Save the initial website message as a communication
Upload attachments to Google Drive
Save attachment metadata in Supabase
Return a JSON success response with ticket number and ticket ID
Attachment Storage Strategy

Attachments are not intended to permanently live on the VPS.

Instead:

n8n temporarily receives or downloads the file
The file is uploaded to Google Drive
Supabase stores file metadata and public/view URLs
The internal panel will later load attachments from stored URLs

This avoids unnecessary VPS disk usage and keeps the database lightweight.

Planned Admin Panel Architecture

The next major phase is the internal support panel.

Planned backend service:

Express.js + TypeScript
Supabase database access
Separate from n8n workflows

Planned APIs:

Ticket list
Ticket detail
Customer detail
Communication history
Attachment retrieval
Send SMS through OpenPhone
Send email replies
Update ticket status, priority, and assignment
Internal notes
Ticket closure

Planned frontend:

Ticket inbox
Ticket detail page
Customer profile panel
Split communication view:
OpenPhone calls, SMS, voicemail, transcript, summary
Email history
Attachment preview modal
Send SMS and email UI
Security Principles
Credentials are never committed to the repository
API keys and secrets must be configured separately
Workflow JSON files must be sanitized before publishing
Google Drive folder IDs, credential IDs, and instance-specific URLs should be replaced with placeholders when needed
Production webhook URLs should be reviewed before public publication