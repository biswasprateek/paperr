import React, { createContext, useContext, useEffect } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useSpaceStore } from '../store/spaceStore';

const AuthContext = createContext(null);

// Axios instance with credentials
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && err.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        useAuthStore.getState().setUser(data.user, data.accessToken);
        return api(original);
      } catch {
        // Refresh failed — leave the user logged in and let the next
        // successful request recover naturally. Only an explicit logout
        // or a missing session on mount will clear the user.
      }
    }
    return Promise.reject(err);
  }
);

// Inject current space ID into every request — unless a caller already set it
// explicitly (e.g. targeting a space that isn't the active one yet, such as a
// newly created space whose setup step runs before the user switches to it).
api.interceptors.request.use((config) => {
  if (!config.headers['X-Space-Id']) {
    const spaceId = useSpaceStore.getState().currentSpaceId;
    if (spaceId) {
      config.headers['X-Space-Id'] = String(spaceId);
    }
  }
  return config;
});

export function AuthProvider({ children }) {
  const { setUser, clearUser, setLoading } = useAuthStore();
  const { setTheme } = useUiStore();

  useEffect(() => {
    setLoading(true);
    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data.user, null);
        useSpaceStore.getState().setSpaces(data.spaces || []);
        const prefs = JSON.parse(data.user.preferences_json || '{}');
        if (prefs.theme) setTheme(prefs.theme);
      })
      .catch(() => {
        clearUser();
        useSpaceStore.getState().clearSpaces();
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password, pin) => {
    const { data } = await api.post('/auth/login', { username, password, pin });
    setUser(data.user, data.accessToken);
    useSpaceStore.getState().setSpaces(data.spaces || []);
    const prefs = JSON.parse(data.user.preferences_json || '{}');
    if (prefs.theme) setTheme(prefs.theme);
    return data;
  };

  const register = async (displayName, username, password, pin) => {
    const { data } = await api.post('/auth/register', { displayName, username, password, pin });
    setUser(data.user, data.accessToken);
    useSpaceStore.getState().setSpaces(data.spaces || []);
    return data;
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    clearUser();
    useSpaceStore.getState().clearSpaces();
  };

  return (
    <AuthContext.Provider value={{ login, register, logout, api }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
