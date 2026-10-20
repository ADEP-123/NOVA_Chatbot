import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, role: 'anon', loading: true });

  const refresh = useCallback(async () => {
    try {
      const me = await api('/auth/me');
      setState({ user: me.user, role: me.role, loading: false });
    } catch {
      setState({ user: null, role: 'anon', loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    await refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ ...state, refresh, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
