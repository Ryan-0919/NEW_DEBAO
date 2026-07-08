export type AdminRole = "super_admin" | "operations_admin" | "user_admin" | "review_admin" | "part_time_reviewer";

const ADMIN_TOKEN_KEY = "adminToken";
const ADMIN_ID_KEY = "adminId";
const ADMIN_ACCOUNT_KEY = "adminAccount";
const ADMIN_ROLE_KEY = "adminRole";

const isBrowser = () => typeof window !== "undefined";

const readLocalStorage = (key: string) => {
  if (!isBrowser()) return "";
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const writeLocalStorage = (key: string, value: string) => {
  if (!isBrowser()) return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
};

export const getAdminToken = () => readLocalStorage(ADMIN_TOKEN_KEY);
export const getAdminId = () => readLocalStorage(ADMIN_ID_KEY);
export const getAdminAccount = () => readLocalStorage(ADMIN_ACCOUNT_KEY);
export const getAdminRole = () => readLocalStorage(ADMIN_ROLE_KEY);

export const saveAdminSession = (payload: { token: string; admin: { id: string; account: string; role?: string } }) => {
  writeLocalStorage(ADMIN_TOKEN_KEY, payload.token);
  writeLocalStorage(ADMIN_ID_KEY, payload.admin.id);
  writeLocalStorage(ADMIN_ACCOUNT_KEY, payload.admin.account);
  writeLocalStorage(ADMIN_ROLE_KEY, payload.admin.role ?? "");
};

export const clearAdminSession = () => {
  writeLocalStorage(ADMIN_TOKEN_KEY, "");
  writeLocalStorage(ADMIN_ID_KEY, "");
  writeLocalStorage(ADMIN_ACCOUNT_KEY, "");
  writeLocalStorage(ADMIN_ROLE_KEY, "");
};

export const isUserManagementRole = (role = getAdminRole()) => role === "super_admin" || role === "user_admin";
export const isContentManagementRole = (role = getAdminRole()) => role === "super_admin" || role === "operations_admin";
export const isReviewManagementRole = (role = getAdminRole()) =>
  role === "super_admin" || role === "operations_admin" || role === "review_admin" || role === "part_time_reviewer";
export const isSystemManagementRole = (role = getAdminRole()) => role === "super_admin" || role === "operations_admin";
export const isAnyAdminRole = (role = getAdminRole()) =>
  role === "super_admin" || role === "operations_admin" || role === "user_admin" || role === "review_admin" || role === "part_time_reviewer";
