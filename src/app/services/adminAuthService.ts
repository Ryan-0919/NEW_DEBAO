import { adminPostJson } from "./adminApiClient";

export type AdminLoginPayload = {
  token: string;
  admin: {
    id: string;
    account: string;
    name?: string;
    role?: string;
  };
};

export const adminAuthService = {
  login: (account: string, password: string) =>
    adminPostJson<AdminLoginPayload>("/api/auth/admin/login", {
      account,
      password,
    }),
};
