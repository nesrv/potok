const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://127.0.0.1:8000");
const tokenKey = "potok_token";

export function getToken() {
  return localStorage.getItem(tokenKey);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(tokenKey, token);
  else localStorage.removeItem(tokenKey);
}

export function userId(): number | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return Number(payload.sub);
  } catch {
    return null;
  }
}

export class ApiError extends Error {}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {
      /* empty */
    }
    throw new ApiError(String(detail));
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export type Progress = {
  order_id: number | null;
  status: string | null;
  buyers: number | null;
  quantity: string | null;
  minimum: string | null;
  remaining: string | null;
  cancel_blocked: boolean | null;
  topup_ends_at: string | null;
};

export type ProductCard = {
  id: number;
  storefront_id: number;
  description: string;
  unit: string;
  minimum: string;
  topup_hours: number;
  photos: { id: number; url: string }[];
  districts: { id: number; name: string }[];
  progress: Progress;
};
