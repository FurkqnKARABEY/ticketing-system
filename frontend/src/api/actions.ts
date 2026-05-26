import { apiRequest } from "./client";

export type OutboundAttachment = {
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data_base64: string;
};

type SendSmsPayload = {
  ticket_id?: string;
  customer_id?: string;
  to: string;
  message: string;
  attachments?: OutboundAttachment[];
};

type SendEmailPayload = {
  ticket_id?: string;
  customer_id?: string;
  to: string;
  subject: string;
  message: string;
  attachments?: OutboundAttachment[];
};

type ActionResponse = {
  success: boolean;
  message: string;
  data: unknown;
};

export const sendSms = async (payload: SendSmsPayload) => {
  return apiRequest<ActionResponse>("/api/actions/send-sms", {
    method: "POST",
    body: payload,
  });
};

export const sendEmail = async (payload: SendEmailPayload) => {
  return apiRequest<ActionResponse>("/api/actions/send-email", {
    method: "POST",
    body: payload,
  });
};
