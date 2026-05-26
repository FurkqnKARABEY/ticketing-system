import { apiRequest } from "./client";
import type { CustomerDetailResponse, CustomersResponse } from "../types/customer";

export const getCustomers = async (page = 1, limit = 10, search = "") => {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (search.trim()) params.set("search", search.trim());

  return apiRequest<CustomersResponse>(`/api/customers?${params.toString()}`);
};

export const getCustomerById = async (id: string) => {
  return apiRequest<CustomerDetailResponse>(`/api/customers/${id}`);
};

