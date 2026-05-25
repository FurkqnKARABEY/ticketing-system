import { apiRequest, clearAuthToken, setAuthToken } from "./client";
import type { LoginResponse, MeResponse } from "../types/auth";

export const login = async (email: string, password: string) => {
  const response = await apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    auth: false,
    body: {
      email,
      password,
    },
  });

  setAuthToken(response.token);

  return response;
};

export const getMe = async () => {
  return apiRequest<MeResponse>("/api/auth/me");
};

export const logout = () => {
  clearAuthToken();
};