import { create } from 'zustand';

interface AuthState {
  token: string | null;
  role: 'admin' | 'portal' | null;
  clientId: string | null;
  loginMessage: string | null;
  setAuth: (token: string, role: 'admin' | 'portal', clientId?: string) => void;
  clearAuth: (message?: string) => void;
  clearMessage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  role: null,
  clientId: null,
  loginMessage: null,
  setAuth: (token, role, clientId) =>
    set({ token, role, clientId: clientId ?? null, loginMessage: null }),
  clearAuth: (message) =>
    set({ token: null, role: null, clientId: null, loginMessage: message ?? null }),
  clearMessage: () => set({ loginMessage: null }),
}));
