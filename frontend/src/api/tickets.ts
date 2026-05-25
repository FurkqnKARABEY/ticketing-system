import { apiRequest } from "./client";
import type { TicketDetailResponse, TicketsResponse } from "../types/ticket";

export const getTickets = async (page = 1, limit = 10) => {
  return apiRequest<TicketsResponse>(`/api/tickets?page=${page}&limit=${limit}`);
};

export const getTicketById = async (id: string) => {
  return apiRequest<TicketDetailResponse>(`/api/tickets/${id}`);
};