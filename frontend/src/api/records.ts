import { apiRequest } from "./client";
import type {
  AddToTicketResponse,
  RecordDetailResponse,
  RecordsResponse,
} from "../types/record";

export const getEmailRecords = async () => {
  return apiRequest<RecordsResponse>("/api/records/email");
};

export const getOpenPhoneRecords = async () => {
  return apiRequest<RecordsResponse>("/api/records/openphone");
};

export const getEmailRecordById = async (id: string) => {
  return apiRequest<RecordDetailResponse>(`/api/records/email/${id}`);
};

export const getOpenPhoneRecordById = async (id: string) => {
  return apiRequest<RecordDetailResponse>(`/api/records/openphone/${id}`);
};

export const addRecordToTicket = async (communicationId: string) => {
  return apiRequest<AddToTicketResponse>(
    `/api/records/${communicationId}/add-to-ticket`,
    {
      method: "POST",
    }
  );
};
