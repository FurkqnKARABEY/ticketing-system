import { apiRequest } from "./client";
import type { DashboardStatsResponse } from "../types/dashboard";

export const getDashboardStats = async () => {
  return apiRequest<DashboardStatsResponse>("/api/dashboard/stats");
};