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
  X,
} from 'lucide-react';
import { Badge, Button, Input } from '@cabzone/design-system';
import { requestOtp, verifyOtp } from '../lib/authApi.js';

interface AdminLoginDialogProps {
  isOpen: boolean;
  onClose?: (() => void) | undefined;
  onSuccess: () => void;
}

export function AdminLoginDialog({ isOpen, onClose, onSuccess }: AdminLoginDialogProps) {
  const [phone, setPhone] = useState('+919000000001');
  const [otp, setOtp] = useState('000000');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // 1-Click Fast Login for Super Admin dev account
  const handleFastSuperAdminLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await requestOtp('+919000000001');
      await verifyOtp('+919000000001', '000000');
      onSuccess();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to authenticate as Super Admin.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-xs p-4">
      <div className="bg-surface rounded-md max-w-md w-full flex flex-col overflow-hidden border border-border-strong animate-in fade-in duration-150">
        {/* Header */}
        <div className="p-4 border-b border-border bg-surface-sunken flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface border border-border rounded-sm text-interactive">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text">Admin Authorization</h2>
              <p className="text-xs text-text-subtle mt-0.5">
                Sign in to manage authoritative zones & operations
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-text-subtle hover:text-text p-1 rounded-sm transition-colors"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {/* Quick Super Admin Button */}
          <div className="p-3.5 rounded-sm border border-border bg-surface-sunken flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text">Development Super Admin</span>
              <Badge tone="accent">DEV BYPASS</Badge>
            </div>
            <p className="text-xs text-text-subtle">
              Instantly authenticate as the seeded Super Admin account (
              <span className="font-mono text-text font-medium">+919000000001</span>).
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<Lock className="size-3.5" />}
              loading={isLoading}
              onClick={handleFastSuperAdminLogin}
              className="mt-1 w-full justify-center"
            >
              1-Click Super Admin Login
            </Button>
          </div>

          <div className="relative flex items-center justify-center my-1">
            <div className="border-t border-border w-full" />
            <span className="bg-surface px-2 text-xs font-medium text-text-subtle uppercase tracking-wider">
              Or Manual Sign In
            </span>
          </div>

          {errorMessage && (
            <div className="p-3 bg-surface border border-danger rounded-sm flex items-start gap-2 text-xs text-danger">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!otpSent ? (
            <form onSubmit={handleRequestOtp} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="admin-phone-input"
                  className="text-xs font-medium text-text"
                >
                  Admin Phone Number (E.164)
                </label>
                <div className="relative">
                  <Phone className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
                  <Input
                    id="admin-phone-input"
                    type="text"
                    required
                    placeholder="+919000000001"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-9 font-mono"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="secondary"
                size="md"
                loading={isLoading}
                icon={<ArrowRight className="size-3.5" />}
                className="w-full justify-center"
              >
                Send OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
              <div className="p-2.5 bg-surface-sunken border border-border rounded-sm flex items-center justify-between text-xs">
                <span className="text-text-subtle">
                  Sending to: <strong className="font-mono text-text">{phone}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="text-xs text-interactive hover:underline font-medium"
                >
                  Change
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="admin-otp-input"
                  className="text-xs font-medium text-text"
                >
                  Enter 6-Digit OTP (Dev Default: 000000)
                </label>
                <div className="relative">
                  <KeyRound className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
                  <Input
                    id="admin-otp-input"
                    type="text"
                    required
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="pl-9 font-mono text-center tracking-widest font-semibold"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isLoading}
                icon={<CheckCircle2 className="size-3.5" />}
                className="w-full justify-center"
              >
                Verify and Access Console
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
