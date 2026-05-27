import { clearUserSession, getUserToken } from "./session";

export const USER_SESSION_EXPIRED_EVENT = "debao:user-session-expired";

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const buildUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

const emitUserSessionExpired = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(USER_SESSION_EXPIRED_EVENT));
};

export class ApiRequestError extends Error {
  code?: number;
  status?: number;

  constructor(message: string, options?: { code?: number; status?: number }) {
    super(message);
    this.name = "ApiRequestError";
    this.code = options?.code;
    this.status = options?.status;
  }
}

export const buildQueryString = (params: Record<string, string | number | boolean | undefined>) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    searchParams.set(key, `${value}`);
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
};

export const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const headers = new Headers(options?.headers);
  const token = getUserToken();

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers,
    });
  } catch {
    throw new ApiRequestError("服务暂时不可用，请稍后重试或联系教务老师");
  }

  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !json || json.code !== 0) {
    const message = json?.message ?? "请求失败";
    if (response.status === 401) {
      clearUserSession();
      emitUserSessionExpired();
    }
    throw new ApiRequestError(message, {
      code: json?.code,
      status: response.status,
    });
  }

  return json.data;
};

export const requestBlob = async (path: string, options?: RequestInit): Promise<Blob> => {
  const headers = new Headers(options?.headers);
  const token = getUserToken();

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers,
    });
  } catch {
    throw new ApiRequestError("服务暂时不可用，请稍后重试或联系教务老师");
  }

  if (!response.ok) {
    let message = "请求失败";
    const json = (await response.clone().json().catch(() => null)) as Partial<ApiEnvelope<unknown>> | null;
    if (json?.message) message = json.message;

    if (response.status === 401) {
      clearUserSession();
      emitUserSessionExpired();
    }

    throw new ApiRequestError(message, {
      code: json?.code,
      status: response.status,
    });
  }

  return response.blob();
};

export const postJson = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

export const patchJson = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

export const putJson = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

export const deleteJson = <T>(path: string) =>
  request<T>(path, {
    method: "DELETE",
  });
