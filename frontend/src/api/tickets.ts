import { apiRequest } from "./client";
import type {
  TicketDetailResponse,
  TicketStatusResponse,
  TicketUpdatePayload,
  TicketUpdateResponse,
  TicketsResponse,
} from "../types/ticket";

export const getTickets = async (page = 1, limit = 25, search = "") => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (search.trim()) {
    params.set("search", search.trim());
  }

  return apiRequest<TicketsResponse>(`/api/tickets?${params.toString()}`);
};

export const getTicketById = async (id: string) => {
  return apiRequest<TicketDetailResponse>(`/api/tickets/${id}`);
};

export const updateTicket = async (id: string, payload: TicketUpdatePayload) => {
  return apiRequest<TicketUpdateResponse>(`/api/tickets/${id}`, {
    method: "PATCH",
    body: payload,
  });
};

export const updateTicketStatus = async (id: string, status: string) => {
  return apiRequest<TicketStatusResponse>(`/api/tickets/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
};
