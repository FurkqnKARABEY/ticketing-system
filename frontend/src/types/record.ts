export type CommunicationRecord = {
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

export type RecordsResponse = {
  success: boolean;
  count: number;
  data: CommunicationRecord[];
};

export type RecordCustomer = {
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

export type RecordAttachment = {
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

export type RecordDetailResponse = {
  success: boolean;
  data: {
    record: CommunicationRecord;
    customer: RecordCustomer | null;
    communications: CommunicationRecord[];
    attachments: RecordAttachment[];
  };
};

export type AddToTicketResponse = {
  success: boolean;
  message: string;
  data: {
    ticket: {
      id: string;
      ticket_number: string;
      customer_id: string | null;
      title: string;
      description: string | null;
      category: string | null;
      status: string;
      priority: string;
      source: string | null;
      created_at: string;
      updated_at: string;
      last_activity_at: string | null;
    };
    linked_communication_id: string;
    notification: {
      channel: "email" | "sms" | null;
      result: unknown;
    };
  };
};
