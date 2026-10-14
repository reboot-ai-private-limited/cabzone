'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  Phone,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@cabzone/design-system';
import { adminLogin, requestOtp, verifyOtp } from '../lib/authApi.js';

interface AdminLoginDialogProps {
  isOpen: boolean;
  onClose?: (() => void) | undefined;
  onSuccess: () => void;
}

export function AdminLoginDialog({ isOpen, onClose, onSuccess }: AdminLoginDialogProps) {
  const [authMode, setAuthMode] = useState<'password' | 'otp'>('password');
  const [phone, setPhone] = useState('+919000000001');
  const [password, setPassword] = useState('admin123');
  const [otp, setOtp] = useState('000000');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // 1-Click Fast Login for the seeded Super Admin development account
  const handleFastSuperAdminLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await adminLogin('+919000000001', 'admin123');
      onSuccess();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to authenticate as Super Admin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await adminLogin(phone.trim(), password);
      onSuccess();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Invalid mobile number or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await requestOtp(phone.trim());
      setOtpSent(true);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to send OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await verifyOtp(phone.trim(), otp.trim());
      onSuccess();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Invalid OTP code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface rounded-2xl max-w-md w-full flex flex-col overflow-hidden border border-border-strong shadow-2xl animate-in fade-in duration-150 my-auto">
        {/* Header */}
        <div className="p-4 border-b border-border bg-surface flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface-muted border border-border-strong rounded-xl text-interactive shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">Sign In</h2>
              <p className="text-xs text-text-subtle mt-0.5">
                Admin console access
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-text-subtle hover:text-text p-1.5 rounded-lg transition-colors hover:bg-surface-muted cursor-pointer"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 bg-surface">
          {/* Segmented Mode Selector */}
          <div className="grid grid-cols-2 p-1 bg-surface-muted rounded-xl border border-border text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('password');
                setErrorMessage(null);
              }}
              className={`py-2 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authMode === 'password'
                  ? 'bg-surface text-text shadow-xs font-semibold border border-border-strong'
                  : 'text-text-subtle hover:text-text'
              }`}
            >
              <Lock className="size-3.5 text-text" />
              <span>Password</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('otp');
                setErrorMessage(null);
              }}
              className={`py-2 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authMode === 'otp'
                  ? 'bg-surface text-text shadow-xs font-semibold border border-border-strong'
                  : 'text-text-subtle hover:text-text'
              }`}
            >
              <KeyRound className="size-3.5 text-text" />
              <span>Mobile OTP</span>
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 bg-surface border border-danger rounded-xl flex items-start gap-2 text-xs text-danger font-medium">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Mode 1: Mobile Number + Password */}
          {authMode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="admin-phone-input" className="text-sm font-semibold text-text">
                  Mobile number
                </label>
                <div className="relative">
                  <Phone className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text" />
                  <input
                    id="admin-phone-input"
                    type="text"
                    required
                    placeholder="+919000000001"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11 w-full pl-10 pr-3.5 rounded-xl font-mono text-sm bg-surface text-text font-normal border border-border-strong hover:border-interactive focus:border-interactive focus:ring-2 focus:ring-interactive/20 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="admin-password-input" className="text-sm font-semibold text-text">
                  Password
                </label>
                <div className="relative">
                  <Lock className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text" />
                  <input
                    id="admin-password-input"
                    type="password"
                    required
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full pl-10 pr-3.5 rounded-xl text-sm bg-surface text-text font-normal border border-border-strong hover:border-interactive focus:border-interactive focus:ring-2 focus:ring-interactive/20 outline-none transition-colors"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isLoading}
                icon={<ArrowRight className="size-3.5" />}
                className="w-full justify-center h-11 rounded-xl mt-1 font-semibold bg-interactive hover:bg-interactive-hover text-white shadow-xs"
              >
                Sign In
              </Button>
            </form>
          )}

          {/* Mode 2: Mobile Number + OTP */}
          {authMode === 'otp' && (
            <>
              {!otpSent ? (
                <form onSubmit={handleRequestOtp} className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="admin-phone-otp-input" className="text-sm font-semibold text-text">
                      Mobile number
                    </label>
                    <div className="relative">
                      <Phone className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text" />
                      <input
                        id="admin-phone-otp-input"
                        type="text"
                        required
                        placeholder="+919000000001"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-11 w-full pl-10 pr-3.5 rounded-xl font-mono text-sm bg-surface text-text font-normal border border-border-strong hover:border-interactive focus:border-interactive focus:ring-2 focus:ring-interactive/20 outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={isLoading}
                    icon={<ArrowRight className="size-3.5" />}
                    className="w-full justify-center h-11 rounded-xl font-semibold bg-interactive hover:bg-interactive-hover text-white shadow-xs"
                  >
                    Send OTP
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3.5">
                  <div className="p-2.5 bg-surface-sunken border border-border-strong rounded-xl flex items-center justify-between text-xs">
                    <span className="text-text-subtle">
                      Code sent to: <strong className="font-mono text-text font-semibold">{phone}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="text-xs text-interactive hover:underline font-semibold cursor-pointer"
                    >
                      Change
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="admin-otp-input" className="text-sm font-semibold text-text">
                      6-digit OTP code
                    </label>
                    <div className="relative">
                      <KeyRound className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text" />
                      <input
                        id="admin-otp-input"
                        type="text"
                        required
                        maxLength={6}
                        placeholder="000000"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        className="h-11 w-full pl-10 pr-3.5 rounded-xl font-mono text-center tracking-widest text-base font-bold bg-surface text-text border border-border-strong hover:border-interactive focus:border-interactive focus:ring-2 focus:ring-interactive/20 outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={isLoading}
                    icon={<CheckCircle2 className="size-3.5" />}
                    className="w-full justify-center h-11 rounded-xl font-semibold bg-interactive hover:bg-interactive-hover text-white shadow-xs"
                  >
                    Verify & Sign In
                  </Button>
                </form>
              )}
            </>
          )}

          {/* Quick Dev Super Admin bypass */}
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-text-subtle text-xs">Development:</span>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleFastSuperAdminLogin}
              className="inline-flex items-center gap-1.5 text-xs text-interactive font-semibold hover:underline cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="size-3 text-interactive" />
              <span>1-Click Super Admin (+919000000001)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
