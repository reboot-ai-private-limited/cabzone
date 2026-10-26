import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import type {
  DriverDto,
  VehicleDto,
  DriverApplicationDto,
  DriverDocumentDto,
  DriverProfileDetailDto,
  KycComplianceSummaryDto,
} from '@cabzone/contracts';
import { authApi, dispatchApi, driverApi, isApiError, subscribeAccessToken } from '@/services/api';
import { canAccessDriverShell as evaluateCanAccessDriverShell } from '@/services/profile';
import {
  clearAuthTokens,
  getAccessToken,
  getOrCreateDeviceId,
  getRefreshToken,
  saveAuthTokens,
  saveAuthUser,
  getAuthUser,
} from '@/services/storage';

export interface AuthUser {
  id: string;
  phoneE164: string;
  role: string;
  isNewUser: boolean;
}

export type AuthStep = 'phone' | 'otp';

interface AuthContextType {
  user: AuthUser | null;
  driverProfile: DriverProfileDetailDto | null;
  driver: DriverDto | null;
  vehicle: VehicleDto | null;
  application: DriverApplicationDto | null;
  documents: DriverDocumentDto[];
  compliance: KycComplianceSummaryDto | null;
  kycStatus: string;
  isKycVerified: boolean;
  canAccessDriverShell: boolean;
  hasVehicle: boolean;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  bootstrapError: string | null;
  error: string | null;
  phone: string;
  step: AuthStep;
  otpCooldown: number;
  setPhone: (phone: string) => void;
  setStep: (step: AuthStep) => void;
  clearError: () => void;
  retryBootstrap: () => Promise<void>;
  sendOtp: (rawPhone?: string) => Promise<boolean>;
  verifyOtp: (otpCode: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  testApprove: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfileDetailDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>('');
  const [step, setStep] = useState<AuthStep>('phone');
  const [otpCooldown, setOtpCooldown] = useState<number>(0);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const restoreSession = useCallback(async () => {
    setIsLoading(true);
    setBootstrapError(null);
    try {
      const storedToken = await getAccessToken();
      const storedRefreshToken = await getRefreshToken();
      const storedUser = await getAuthUser();

      if (!storedToken || !storedRefreshToken || !storedUser) {
        await clearAuthTokens();
        setUser(null);
        setToken(null);
        setDriverProfile(null);
        setIsLoading(false);
        return;
      }

      const deviceId = await getOrCreateDeviceId();

      try {
        // Attempt refreshing token to verify validity
        const refreshRes = await authApi.refreshToken(storedRefreshToken, deviceId);
        await saveAuthTokens(refreshRes.accessToken, refreshRes.refreshToken);
        setToken(refreshRes.accessToken);
        setUser(storedUser);

        // Fetch driver profile
        const profile = await authApi.getDriverProfile(refreshRes.accessToken);
        setDriverProfile(profile);
      } catch (refreshErr: unknown) {
        // If refresh explicitly returned 401/403 (revoked/expired refresh token), try stored access token once
        try {
          const profile = await authApi.getDriverProfile(storedToken);
          setToken(storedToken);
          setUser(storedUser);
          setDriverProfile(profile);
        } catch (profileErr: unknown) {
          const isAuthRevoked =
            isApiError(refreshErr) &&
            refreshErr.isUnauthorized &&
            isApiError(profileErr) &&
            profileErr.isUnauthorized;

          if (isAuthRevoked) {
            await clearAuthTokens();
            setUser(null);
            setToken(null);
            setDriverProfile(null);
          } else {
            // Network / server failure: preserve tokens & user identity and show retryable bootstrap state
            setToken(storedToken);
            setUser(storedUser);
            const errMsg =
              profileErr instanceof Error
                ? profileErr.message
                : 'Unable to reach Cabzone server. Check your internet connection and retry.';
            setBootstrapError(errMsg);
          }
        }
      }
    } catch (err: unknown) {
      console.warn('Session restoration failed:', err);
      setBootstrapError(
        err instanceof Error ? err.message : 'Unable to restore session. Please retry.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial session restoration
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!user || !token) return;
    let active = true;
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getAccessToken().then(async (stored) => {
        if (!active || !stored) return;
        setToken((current) => (current === stored ? current : stored));
        try {
          const freshProfile = await authApi.getDriverProfile(stored);
          if (active) setDriverProfile(freshProfile);
        } catch {
          // Ignore transient foreground profile sync error
        }
      });
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [user, token]);

  useEffect(
    () =>
      subscribeAccessToken((freshToken) => {
        if (freshToken) {
          setToken(freshToken);
        } else {
          void clearAuthTokens();
          setToken(null);
          setUser(null);
          setDriverProfile(null);
          setBootstrapError('Session expired. Please sign in again.');
        }
      }),
    [],
  );

  const formatE164 = (raw: string): string => {
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+${cleaned}`;
    }
    if (raw.startsWith('+')) {
      return raw;
    }
    return `+91${cleaned}`;
  };

  const sendOtp = useCallback(
    async (rawPhone?: string): Promise<boolean> => {
      const targetPhone = rawPhone || phone;
      if (!targetPhone) {
        setError('Please enter your phone number');
        return false;
      }

      const formatted = formatE164(targetPhone);
      setError(null);

      try {
        const res = await authApi.requestOtp(formatted);
        setPhone(formatted);
        setOtpCooldown(res.retryAfterSeconds || 60);
        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to send OTP';
        setError(message);
        return false;
      }
    },
    [phone],
  );

  const verifyOtp = useCallback(
    async (otpCode: string): Promise<boolean> => {
      if (!phone) {
        setError('Phone number is missing');
        setStep('phone');
        return false;
      }

      if (!otpCode || otpCode.length !== 6) {
        setError('Please enter the full 6-digit OTP');
        return false;
      }

      setError(null);

      try {
        const deviceId = await getOrCreateDeviceId();
        const res = await authApi.verifyOtp({
          phoneE164: phone,
          otp: otpCode,
          deviceId,
        });

        await saveAuthTokens(res.accessToken, res.refreshToken);
        await saveAuthUser(res.user);
        setToken(res.accessToken);
        setUser(res.user);

        // Fetch driver profile
        const profile = await authApi.getDriverProfile(res.accessToken);
        setDriverProfile(profile);

        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Invalid OTP code';
        setError(message);
        return false;
      }
    },
    [phone],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      if (token) {
        await dispatchApi.unregisterPushToken(token, await getOrCreateDeviceId()).catch(() => {});
        await authApi.logout(token).catch(() => {});
      }
    } finally {
      await clearAuthTokens();
      setUser(null);
      setDriverProfile(null);
      setToken(null);
      setStep('phone');
      setPhone('');
      setError(null);
      setBootstrapError(null);
      setIsLoading(false);
    }
  }, [token]);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    try {
      const profile = await authApi.getDriverProfile(token);
      setDriverProfile(profile);
      setBootstrapError(null);
    } catch (err) {
      console.warn('Failed to refresh driver profile:', err);
    }
  }, [token]);

  const testApprove = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    setIsLoading(true);
    try {
      const res = await driverApi.testApprove(token);
      setDriverProfile(res);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to test approve';
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const driver = driverProfile?.driver || null;
  const vehicle = driverProfile?.vehicle || null;
  const application = driverProfile?.application || null;
  const documents = driverProfile?.documents || [];
  const compliance = driverProfile?.compliance || null;
  const kycStatus = driver?.kycStatus || 'PENDING';
  const isKycVerified = driver?.kycStatus === 'VERIFIED' && driver?.status === 'ACTIVE';
  const canAccessDriverShell = evaluateCanAccessDriverShell(driver);
  const hasVehicle = !!driver?.currentVehicleId;

  return (
    <AuthContext.Provider
      value={{
        user,
        driverProfile,
        driver,
        vehicle,
        application,
        documents,
        compliance,
        kycStatus,
        isKycVerified,
        canAccessDriverShell,
        hasVehicle,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        bootstrapError,
        error,
        phone,
        step,
        otpCooldown,
        setPhone,
        setStep,
        clearError: () => setError(null),
        retryBootstrap: restoreSession,
        sendOtp,
        verifyOtp,
        logout,
        refreshProfile,
        testApprove,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
