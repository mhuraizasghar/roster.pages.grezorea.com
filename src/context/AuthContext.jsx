import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getStoredToken, setStoredToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const res = await api.get('/api/auth/me');
      setUser(res.user);
      return res.user;
    } catch {
      setStoredToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const loginWithToken = useCallback((token, userObj) => {
    setStoredToken(token);
    setUser(userObj);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) {
        await api.post('/api/auth/logout', {});
      }
    } catch {
      // Clear local session regardless
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshMe, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
