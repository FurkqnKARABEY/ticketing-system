import { apiRequest } from "./client";
import type { TicketDetailResponse, TicketsResponse } from "../types/ticket";

export const getTickets = async (page = 1, limit = 10, search = "") => {
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
