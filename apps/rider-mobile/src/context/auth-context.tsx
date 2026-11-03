import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { DEFAULT_MAP_THEME } from '@/services/map-theme';
import type {
  AuthenticatedUserSummary,
  RiderDto,
  UpdateRiderProfileDto,
} from '@cabzone/contracts';
import {
  authApi,
  isApiError,
  pushApi,
  rideCallsApi,
  riderProfileApi,
  subscribeAccessToken,
} from '@/services/api';
import {
  getNativeCallPushTokenAsync,
  listenForPushTokenChanges,
  registerForPushAsync,
} from '@/services/push-notifications';
import {
  clearAuthTokens,
  getAccessToken,
  getAuthUser,
  getOrCreateDeviceId,
  getRiderPreferences,
  getSavedRouteTemplates,
  saveAuthTokens,
  saveAuthUser,
  saveRiderPreferences,
  saveRouteTemplates,
  type RiderLocalPreferences,
} from '@/services/storage';
import type { SavedRouteTemplate } from '@/services/rider-helpers';
import { stopActiveRideCallMedia } from '@/services/ride-call-media';

interface AuthContextValue {
  isBootstrapping: boolean;
  bootstrapError: string | null;
  token: string | null;
  user: AuthenticatedUserSummary | null;
  profile: RiderDto | null;
  pendingPhoneE164: string;
  setPendingPhoneE164: (phone: string) => void;
  needsNameSetup: boolean;
  templates: SavedRouteTemplate[];
  preferences: RiderLocalPreferences;
  requestOtp: (phoneE164: string) => Promise<void>;
  verifyOtp: (phoneE164: string, otp: string) => Promise<RiderDto | null>;
  updateProfile: (payload: UpdateRiderProfileDto) => Promise<RiderDto>;
  refreshProfile: () => Promise<RiderDto | null>;
  retryBootstrap: () => Promise<void>;
  addTemplate: (template: Omit<SavedRouteTemplate, 'id' | 'createdAt'>) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;
  updatePreferences: (partial: Partial<RiderLocalPreferences>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUserSummary | null>(null);
  const [profile, setProfile] = useState<RiderDto | null>(null);
  const [pendingPhoneE164, setPendingPhoneE164] = useState<string>('');
  const [templates, setTemplates] = useState<SavedRouteTemplate[]>([]);
  const [preferences, setPreferences] = useState<RiderLocalPreferences>({
    operationalCity: 'Siliguri',
    distanceUnit: 'km',
    language: 'en',
    mapTheme: DEFAULT_MAP_THEME,
  });

  const loadUserScopedStorage = useCallback(async (userId: string) => {
    const [savedTemplates, savedPrefs] = await Promise.all([
      getSavedRouteTemplates(userId),
      getRiderPreferences(userId),
    ]);
    setTemplates(savedTemplates);
    setPreferences(savedPrefs);
  }, []);

  const bootstrap = useCallback(async () => {
    setIsBootstrapping(true);
    setBootstrapError(null);
    try {
      const [storedToken, storedUser] = await Promise.all([
        getAccessToken(),
        getAuthUser(),
      ]);

      if (!storedToken) {
        setToken(null);
        setUser(null);
        setProfile(null);
        return;
      }

      setToken(storedToken);
      if (storedUser) {
        setUser(storedUser);
        await loadUserScopedStorage(storedUser.id);
      }

      const fetchedProfile = await riderProfileApi.getProfile(storedToken);
      setProfile(fetchedProfile);
      if (!storedUser && fetchedProfile) {
        await loadUserScopedStorage(fetchedProfile.userId);
      }
    } catch (err: unknown) {
      if (isApiError(err) && err.isUnauthorized) {
        await clearAuthTokens();
        setToken(null);
        setUser(null);
        setProfile(null);
      } else {
        setBootstrapError(
          err instanceof Error
            ? err.message
            : 'Unable to connect to Cabzone server. Check your network connection.',
        );
      }
    } finally {
      setIsBootstrapping(false);
    }
  }, [loadUserScopedStorage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void bootstrap();
    }, 0);
    return () => clearTimeout(timer);
  }, [bootstrap]);

  useEffect(() => {
    return subscribeAccessToken((nextToken) => {
      setToken(nextToken);
      if (!nextToken) {
        void clearAuthTokens();
        setUser(null);
        setProfile(null);
        setTemplates([]);
      }
    });
  }, []);

  // Register this installation for push so ride updates reach the rider while backgrounded.
  useEffect(() => {
    if (isBootstrapping || !token) return;
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    void getOrCreateDeviceId().then(async (installationId) => {
      if (cancelled) return;
      subscription = listenForPushTokenChanges((pushToken) => {
        void pushApi.registerPushToken(token, pushToken, installationId).catch((error: unknown) => {
          console.warn('Rider push token update failed:', error);
        });
      });
      const pushToken = await registerForPushAsync();
      if (pushToken && !cancelled) {
        await pushApi
          .registerPushToken(token, pushToken, installationId, {
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            transport: 'EXPO',
          })
          .catch((error: unknown) => {
            console.warn('Rider push registration failed:', error);
          });
      }
      const nativeCallToken = await getNativeCallPushTokenAsync();
      if (nativeCallToken && !cancelled) {
        await pushApi
          .registerPushToken(token, nativeCallToken.token, installationId, {
            platform: nativeCallToken.platform,
            transport: nativeCallToken.transport,
          })
          .catch(() => {});
      }
    });
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [isBootstrapping, token]);

  const requestOtp = useCallback(async (phoneE164: string) => {
    await authApi.requestOtp(phoneE164);
    setPendingPhoneE164(phoneE164);
  }, []);

  const verifyOtp = useCallback(
    async (phoneE164: string, otp: string): Promise<RiderDto | null> => {
      const deviceId = await getOrCreateDeviceId();
      const verified = await authApi.verifyOtp({
        phoneE164,
        otp,
        deviceId,
      });
      await Promise.all([
        saveAuthTokens(verified.accessToken, verified.refreshToken),
        saveAuthUser(verified.user),
      ]);
      setToken(verified.accessToken);
      setUser(verified.user);
      await loadUserScopedStorage(verified.user.id);

      // OTP is already consumed and tokens saved: a failed profile fetch must not read as a failed login.
      const riderProfile = await riderProfileApi
        .getProfile(verified.accessToken)
        .catch(() => null);
      setProfile(riderProfile);
      return riderProfile;
    },
    [loadUserScopedStorage],
  );

  const refreshProfile = useCallback(async (): Promise<RiderDto | null> => {
    if (!token) return null;
    const latest = await riderProfileApi.getProfile(token);
    setProfile(latest);
    return latest;
  }, [token]);

  const updateProfile = useCallback(
    async (payload: UpdateRiderProfileDto): Promise<RiderDto> => {
      if (!token) throw new Error('Authentication required');
      const updated = await riderProfileApi.updateProfile(token, payload);
      setProfile(updated);
      return updated;
    },
    [token],
  );

  const addTemplate = useCallback(
    async (template: Omit<SavedRouteTemplate, 'id' | 'createdAt'>) => {
      const userId = user?.id ?? profile?.userId;
      if (!userId) return;
      const newTemplate: SavedRouteTemplate = {
        ...template,
        id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
      };
      const next = [newTemplate, ...templates];
      setTemplates(next);
      await saveRouteTemplates(userId, next);
    },
    [profile?.userId, templates, user?.id],
  );

  const removeTemplate = useCallback(
    async (id: string) => {
      const userId = user?.id ?? profile?.userId;
      if (!userId) return;
      const next = templates.filter((t) => t.id !== id);
      setTemplates(next);
      await saveRouteTemplates(userId, next);
    },
    [profile?.userId, templates, user?.id],
  );

  const updatePreferences = useCallback(
    async (partial: Partial<RiderLocalPreferences>) => {
      const userId = user?.id ?? profile?.userId;
      const next: RiderLocalPreferences = {
        ...preferences,
        ...partial,
      };
      setPreferences(next);
      if (userId) {
        await saveRiderPreferences(userId, next);
      }
    },
    [preferences, profile?.userId, user?.id],
  );

  const logout = useCallback(async () => {
    const activeToken = token;
    try {
      if (activeToken) {
        const installationId = await getOrCreateDeviceId();
        await rideCallsApi.endCurrent(activeToken).catch(() => {});
        await stopActiveRideCallMedia();
        await pushApi.unregisterPushToken(activeToken, installationId).catch(() => {});
        await authApi.logout(activeToken).catch(() => {});
      }
    } finally {
      await clearAuthTokens();
      setToken(null);
      setUser(null);
      setProfile(null);
      setTemplates([]);
    }
  }, [token]);

  const needsNameSetup = useMemo(() => {
    if (!token || !profile) return false;
    return !profile.name || !profile.name.trim();
  }, [profile, token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isBootstrapping,
      bootstrapError,
      token,
      user,
      profile,
      pendingPhoneE164,
      setPendingPhoneE164,
      needsNameSetup,
      templates,
      preferences,
      requestOtp,
      verifyOtp,
      updateProfile,
      refreshProfile,
      retryBootstrap: bootstrap,
      addTemplate,
      removeTemplate,
      updatePreferences,
      logout,
    }),
    [
      isBootstrapping,
      bootstrapError,
      token,
      user,
      profile,
      pendingPhoneE164,
      needsNameSetup,
      templates,
      preferences,
      requestOtp,
      verifyOtp,
      updateProfile,
      refreshProfile,
      bootstrap,
      addTemplate,
      removeTemplate,
      updatePreferences,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
