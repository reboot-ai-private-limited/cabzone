import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type {
  DriverDto,
  VehicleDto,
  DriverApplicationDto,
  DriverDocumentDto,
  DriverProfileDetailDto,
} from '@cabzone/contracts';
import { authApi, driverApi } from '@/services/api';
import {
  clearAuthTokens,
  getAccessToken,
  getOrCreateDeviceId,
  getRefreshToken,
  saveAuthTokens,
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
  kycStatus: string;
  isKycVerified: boolean;
  hasVehicle: boolean;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  phone: string;
  step: AuthStep;
  otpCooldown: number;
  setPhone: (phone: string) => void;
  setStep: (step: AuthStep) => void;
  clearError: () => void;
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

  // Initial session restoration
  useEffect(() => {
    async function restoreSession() {
      try {
        const storedToken = await getAccessToken();
        const storedRefreshToken = await getRefreshToken();

        if (!storedToken || !storedRefreshToken) {
          setIsLoading(false);
          return;
        }

        const deviceId = await getOrCreateDeviceId();

        try {
          // Attempt refreshing token to verify validity
          const refreshRes = await authApi.refreshToken(storedRefreshToken, deviceId);
          await saveAuthTokens(refreshRes.accessToken, refreshRes.refreshToken);
          setToken(refreshRes.accessToken);
          setUser(refreshRes.user);

          // Fetch driver profile
          const profile = await authApi.getDriverProfile(refreshRes.accessToken);
          setDriverProfile(profile);
        } catch {
          // If refresh fails, try using existing access token for profile check
          try {
            const profile = await authApi.getDriverProfile(storedToken);
            if (profile) {
              setToken(storedToken);
              setDriverProfile(profile);
            } else {
              await clearAuthTokens();
            }
          } catch {
            await clearAuthTokens();
          }
        }
      } catch (err: unknown) {
        console.warn('Session restoration failed:', err);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

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
        let res;
        try {
          res = await authApi.requestOtp(formatted);
        } catch (err) {
          if (__DEV__) {
            console.warn('API Failed, mocking OTP success for DEV');
            res = { retryAfterSeconds: 60 };
          } else {
            throw err;
          }
        }
        setPhone(formatted);
        // Do NOT set step to 'otp' here since SignupStep handles the OTP UI now
        // setStep('otp'); 
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
        let res;
        
        if (__DEV__ && otpCode === '000000') {
          console.warn('DEV mode: 000000 entered, mocking verify success');
          res = {
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            user: {
              id: '1',
              phoneE164: phone,
              role: 'DRIVER',
              isNewUser: false,
            },
          };
        } else {
          res = await authApi.verifyOtp({
            phoneE164: phone,
            otp: otpCode,
            deviceId,
          });
        }

        await saveAuthTokens(res.accessToken, res.refreshToken);
        setToken(res.accessToken);
        setUser(res.user);

        // Fetch driver profile
        if (__DEV__ && otpCode === '000000') {
          setDriverProfile(null);
        } else {
          const profile = await authApi.getDriverProfile(res.accessToken);
          setDriverProfile(profile);
        }

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
      setIsLoading(false);
    }
  }, [token]);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    try {
      const profile = await authApi.getDriverProfile(token);
      setDriverProfile(profile);
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
  const kycStatus = driver?.kycStatus || 'PENDING';
  const isKycVerified = driver?.kycStatus === 'VERIFIED' && driver?.status === 'ACTIVE';
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
        kycStatus,
        isKycVerified,
        hasVehicle,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        error,
        phone,
        step,
        otpCooldown,
        setPhone,
        setStep,
        clearError: () => setError(null),
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
