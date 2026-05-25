export type AppUser = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "agent";
  is_active: boolean;
};

export type LoginResponse = {
  success: boolean;
  message: string;
  token: string;
  user: AppUser;
};

export type MeResponse = {
  success: boolean;
  user: AppUser;
};