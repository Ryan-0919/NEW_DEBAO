import { clearAdminSession, getAdminToken } from "../lib/admin-session";

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const buildUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

export class AdminApiRequestError extends Error {
  code?: number;
  status?: number;

  constructor(message: string, options?: { code?: number; status?: number }) {
    super(message);
    this.name = "AdminApiRequestError";
    this.code = options?.code;
    this.status = options?.status;
  }
}

export const buildAdminQueryString = (params: Record<string, string | number | boolean | undefined>) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    searchParams.set(key, `${value}`);
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
};

export const adminRequest = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const headers = new Headers(options?.headers);
  const token = getAdminToken();

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers,
    });
  } catch {
    throw new AdminApiRequestError("无法连接得宝后台服务，请确认 API 已启动");
  }

  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !json || json.code !== 0) {
    const message = json?.message ?? "请求失败";
    if (response.status === 401) clearAdminSession();
    throw new AdminApiRequestError(message, {
      code: json?.code,
      status: response.status,
    });
  }

  return json.data;
};

export const adminRequestBlob = async (path: string, options?: RequestInit): Promise<Blob> => {
  const headers = new Headers(options?.headers);
  const token = getAdminToken();

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers,
    });
  } catch {
    throw new AdminApiRequestError("无法连接得宝后台服务，请确认 API 已启动");
  }

  if (!response.ok) {
    const json = (await response.clone().json().catch(() => null)) as Partial<ApiEnvelope<unknown>> | null;
    const message = json?.message ?? "请求失败";
    if (response.status === 401) clearAdminSession();
    throw new AdminApiRequestError(message, {
      code: json?.code,
      status: response.status,
    });
  }

  return response.blob();
};

export const adminPostJson = <T>(path: string, body?: unknown) =>
  adminRequest<T>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

export const adminPatchJson = <T>(path: string, body?: unknown) =>
  adminRequest<T>(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

export const adminDelete = <T>(path: string) =>
  adminRequest<T>(path, {
    method: "DELETE",
  });

export const adminPostForm = <T>(path: string, body: FormData) =>
  adminRequest<T>(path, {
    method: "POST",
    body,
  });
