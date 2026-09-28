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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Admin Authorization Required</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Sign in to manage authoritative zones & operations
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Quick Super Admin Button */}
          <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/60 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950">Development Super Admin</span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-200 text-indigo-900">
                DEV BYPASS
              </span>
            </div>
            <p className="text-xs text-indigo-800">
              Instantly authenticate as the seeded Super Admin account (
              <span className="font-mono font-medium">+919000000001</span>).
            </p>
            <button
              type="button"
              onClick={handleFastSuperAdminLogin}
              disabled={isLoading}
              className="mt-1 w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Authorizing...' : '1-Click Super Admin Login'}</span>
            </button>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Or Manual Sign In
            </span>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!otpSent ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-phone-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Admin Phone Number (E.164)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-phone-input"
                    type="text"
                    required
                    placeholder="+919000000001"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg font-mono focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
              >
                <span>{isLoading ? 'Sending OTP...' : 'Send OTP'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                <span className="text-slate-600">Sending to: <strong className="font-mono text-slate-900">{phone}</strong></span>
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  Change
                </button>
              </div>

              <div>
                <label
                  htmlFor="admin-otp-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Enter 6-Digit OTP (Dev Default: 000000)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-otp-input"
                    type="text"
                    required
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg font-mono text-center tracking-widest text-sm font-bold focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Verifying...' : 'Verify and Access Console'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
