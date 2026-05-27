import { apiRequest } from "./client";
import type {
  AddToTicketResponse,
  RecordDetailResponse,
  RecordsResponse,
} from "../types/record";

type RecordsView = "records" | "conversations";

const buildRecordsQuery = ({
  page,
  limit,
  search,
  view,
}: {
  page: number;
  limit: number;
  search: string;
  view: RecordsView;
}) => {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  params.set("view", view);
  if (search.trim()) params.set("search", search.trim());
  return params.toString();
};

export const getEmailRecords = async (
  page = 1,
  limit = 25,
  search = "",
  view: RecordsView = "records"
) => {
  const query = buildRecordsQuery({ page, limit, search, view });
  return apiRequest<RecordsResponse>(`/api/records/email?${query}`);
};

export const getOpenPhoneRecords = async (
  page = 1,
  limit = 25,
  search = "",
  view: RecordsView = "records"
) => {
  const query = buildRecordsQuery({ page, limit, search, view });
  return apiRequest<RecordsResponse>(`/api/records/openphone?${query}`);
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
