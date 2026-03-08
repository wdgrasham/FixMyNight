import { useAuthStore } from './store';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { token, clearAuth } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    let code = 'TOKEN_INVALID';
    try {
      const body = await res.json();
      code = body.detail || 'TOKEN_INVALID';
    } catch { /* empty */ }

    if (code === 'SESSION_EXPIRED') {
      clearAuth('Your session has expired. Please log in again.');
    } else {
      clearAuth('Authentication error. Please log in again.');
    }
    throw new ApiError(401, code, code);
  }

  if (res.status === 403) {
    let code = 'FORBIDDEN';
    try {
      const body = await res.json();
      code = body.detail || 'FORBIDDEN';
    } catch { /* empty */ }

    if (code === 'CLIENT_SCOPE_MISMATCH') {
      clearAuth();
    }
    throw new ApiError(403, code, code);
  }

  if (res.status === 429) {
    throw new ApiError(429, 'Too many attempts. Please wait 15 minutes.');
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.detail || message;
    } catch { /* empty */ }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}
