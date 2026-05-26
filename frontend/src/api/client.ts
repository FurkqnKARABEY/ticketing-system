const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export const getAuthToken = () => {
  return localStorage.getItem("support_desk_token");
};

export const setAuthToken = (token: string) => {
  localStorage.setItem("support_desk_token", token);
};

export const clearAuthToken = () => {
  localStorage.removeItem("support_desk_token");
};

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> => {
  const { method = "GET", body, auth = true } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getAuthToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "API request failed");
  }

  return data as T;
};
