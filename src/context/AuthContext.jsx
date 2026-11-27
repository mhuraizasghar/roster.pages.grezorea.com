import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api, getStoredToken, setStoredToken } from '../lib/api';
import { supabase, anonKey, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);
const CACHED_USER_KEY = 'roster.auth.user';

function readCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(CACHED_USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeCachedUser(user) {
  try {
    if (user) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHED_USER_KEY);
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const bootstrapStarted = useRef(false);

  const refreshMe = useCallback(async () => {
    const cachedUser = readCachedUser();
    const token = getStoredToken();
    if (cachedUser) {
      setUser(cachedUser);
    }
    if (!token) {
      setUser(null);
      writeCachedUser(null);
      setLoading(false);
      return null;
    }
    try {
      const res = await api.get('/api/auth/me');
      setUser(res.user);
      writeCachedUser(res.user);
      return res.user;
    } catch (error) {
      // The Roster HMAC session is checked first. Only an expired/invalid
      // session needs a Supabase refresh, avoiding an Auth round-trip on each
      // page reload while keeping normal token rotation working.
      if (error?.status === 401 && ['google', 'email'].includes(cachedUser?.authProvider) && isSupabaseConfigured && supabase) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (accessToken) {
            const session = await api.post('/api/auth/google/token', {
              accessToken,
              anonKey,
              portalRole: cachedUser.role,
              authProvider: cachedUser.authProvider,
              institutionName: cachedUser.institutionName || '',
            });
            setStoredToken(session.token);
            setUser(session.user);
            writeCachedUser(session.user);
            return session.user;
          }
        } catch {
          // A transient Auth error does not discard a locally cached session.
        }
      }

      if (cachedUser && error?.status !== 401) {
        setUser(cachedUser);
        return cachedUser;
      }

      if (error?.status === 401) {
        setStoredToken(null);
        writeCachedUser(null);
      }
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    refreshMe();
  }, [refreshMe]);

  const loginWithToken = useCallback((token, userObj) => {
    setStoredToken(token);
    writeCachedUser(userObj);
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
      writeCachedUser(null);
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
