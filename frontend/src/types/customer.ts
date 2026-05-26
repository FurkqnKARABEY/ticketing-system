export type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email_primary: string | null;
  email_secondary: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  phone_primary_normalized: string | null;
  phone_secondary_normalized: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type CustomersResponse = {
  success: boolean;
  count: number;
  pagination: Pagination;
  data: Customer[];
};

export type CustomerTicket = {
  id: string;
  ticket_number: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  priority: string;
  source: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type CustomerCommunication = {
  id: string;
  ticket_id: string | null;
  customer_id: string | null;
  channel: string;
  direction: string;
  author_type: string | null;
  author_name: string | null;
  phone_number: string | null;
  phone_number_normalized: string | null;
  email_address: string | null;
  subject: string | null;
  message_body: string | null;
  message_type: string | null;
  external_id: string | null;
  openphone_call_id: string | null;
  openphone_message_id: string | null;
  email_message_id: string | null;
  call_type: string | null;
  file_type: string | null;
  recording_url: string | null;
  transcript_url: string | null;
  transcript_text: string | null;
  summary: string | null;
  occurred_at: string | null;
  created_at: string;
};

export type CustomerAttachment = {
  id: string;
  communication_id: string | null;
  ticket_id: string | null;
  customer_id: string | null;
  file_type: string | null;
  file_name: string | null;
  file_url: string | null;
  source: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  external_id: string | null;
  communication_channel: string | null;
  created_at: string;
};

export type CustomerDetail = {
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email_primary: string | null;
    email_secondary: string | null;
    phone_primary: string | null;
    phone_secondary: string | null;
    phone_primary_normalized: string | null;
    phone_secondary_normalized: string | null;
    shipping_address: unknown | null;
    billing_address: unknown | null;
    customer_notes: string | null;
    source: string | null;
    created_at: string;
    updated_at: string;
  };
  tickets: CustomerTicket[];
  communications: CustomerCommunication[];
  attachments: CustomerAttachment[];
};

export type CustomerDetailResponse = {
  success: boolean;
  data: CustomerDetail;
};

