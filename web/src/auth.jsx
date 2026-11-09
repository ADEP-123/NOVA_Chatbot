import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, role: 'anon', quota: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const me = await api('/auth/me');
      setState({ user: me.user, role: me.role, quota: me.quota, loading: false });
    } catch {
      setState({ user: null, role: 'anon', quota: null, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    await refresh();
  }, [refresh]);

  const setQuota = useCallback((quota) => setState((s) => ({ ...s, quota })), []);

  return <AuthContext.Provider value={{ ...state, refresh, logout, setQuota }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
