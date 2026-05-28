import { apiRequest } from "./client";
import type { TicketDetailResponse, TicketsResponse } from "../types/ticket";

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

export const updateTicketStatus = async (id: string, status: string) => {
  return apiRequest<{ success: boolean; data: unknown }>(`/api/tickets/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
};
