'use client';

import React, { useEffect, useState } from 'react';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { AdminLoginDialog } from '../features/auth/components/AdminLoginDialog';
import { getStoredToken } from '../features/auth/lib/authApi';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    // If operator has no stored token, prompt login dialog on initial load
    const token = getStoredToken();
    if (!token) {
      setIsLoginOpen(true);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-surface-sunken text-text">
      <TopBar onOpenLogin={() => setIsLoginOpen(true)} />
      <div className="flex flex-1 min-w-0">
        <SideNav onOpenLogin={() => setIsLoginOpen(true)} />
        <main className="flex-1 p-6 overflow-auto min-w-0">
          <div className="max-w-content-max mx-auto w-full flex flex-col gap-6">
            {children}
          </div>
        </main>
      </div>

      <AdminLoginDialog
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSuccess={() => {
          setIsLoginOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
}
