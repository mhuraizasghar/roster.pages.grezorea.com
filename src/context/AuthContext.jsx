import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getStoredToken, setStoredToken } from '../lib/api';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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

  const refreshMe = useCallback(async () => {
    const cachedUser = readCachedUser();
    let token = getStoredToken();
    if (cachedUser) {
      setUser(cachedUser);
    }
    // Supabase rotates OAuth access tokens. A reload used to keep the old JWT
    // in Roster storage and treat it as a session, which broke protected API
    // requests after the first token refresh.
    if (['google', 'email'].includes(cachedUser?.authProvider) && isSupabaseConfigured && supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) {
        try {
          const session = await api.post('/api/auth/google/token', {
            accessToken,
            portalRole: cachedUser.role,
            authProvider: cachedUser.authProvider,
            institutionName: cachedUser.institutionName || '',
          });
          token = session.token;
          setStoredToken(token);
          const refreshedUser = { ...cachedUser, ...session.user };
          setUser(refreshedUser);
          writeCachedUser(refreshedUser);
        } catch {
          // Continue with the stored Roster session; a temporary auth endpoint
          // outage should not log a teacher or student out of the workspace.
        }
      }
    }
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const res = await api.get('/api/auth/me');
      setUser(res.user);
      writeCachedUser(res.user);
      return res.user;
    } catch (error) {
      if ([405, 404, 503].includes(error?.status) && isSupabaseConfigured && supabase) {
        const { data, error: userError } = await supabase.auth.getUser(token);
        if (!userError && data?.user?.email) {
          const email = String(data.user.email).trim().toLowerCase();
          const role = cachedUser?.role || (sessionStorage.getItem('googleAuthPortalRole') === 'student' ? 'student' : 'teacher');
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
          writeCachedUser(fallbackUser);
          return fallbackUser;
        }
      }

      if (cachedUser) {
        setUser(cachedUser);
        return cachedUser;
      }

      if ([401, 403].includes(error?.status)) {
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
