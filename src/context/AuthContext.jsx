import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getStoredToken, setStoredToken } from '../lib/api';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
    } catch (error) {
      if ([405, 404, 503].includes(error?.status) && isSupabaseConfigured && supabase) {
        const { data, error: userError } = await supabase.auth.getUser(token);
        if (!userError && data?.user?.email) {
          const email = String(data.user.email).trim().toLowerCase();
          const role = sessionStorage.getItem('googleAuthPortalRole') === 'student' ? 'student' : 'teacher';
          const fallbackUser = {
            id: `google_${data.user.id.slice(0, 12)}`,
            email,
            role,
            displayName: String(data.user.user_metadata?.full_name || data.user.user_metadata?.name || email.split('@')[0]).trim().slice(0, 80),
            institutionName: '',
            authProvider: 'google',
            emailVerified: true,
          };
          setUser(fallbackUser);
          return fallbackUser;
        }
      }
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
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut().catch(() => {});
      }
      sessionStorage.removeItem('googleAuthPortalRole');
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
