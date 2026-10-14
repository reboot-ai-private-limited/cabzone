'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { LogIn, LogOut, Shield } from 'lucide-react';
import { Button } from '@cabzone/design-system';
import { getStoredPhone, getStoredToken, logout } from '../features/auth/lib/authApi';

interface TopBarProps {
  onOpenLogin?: () => void;
}

export function TopBar({ onOpenLogin }: TopBarProps) {
  const [adminPhone, setAdminPhone] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setAdminPhone(getStoredPhone());
    } else {
      setAdminPhone(null);
    }
  }, []);

  const handleLogout = () => {
    logout();
    setAdminPhone(null);
    window.location.reload();
  };

  return (
    <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-between z-30 shrink-0">
      <div className="flex items-center gap-3">
        <Link href="/admins" className="flex items-center text-text hover:opacity-90 transition-opacity">
          <Image src="/brand/cabzone-horizontal.png" alt="Cabzone" width={132} height={44} priority />
        </Link>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 text-text-subtle">
          <span className="size-2 rounded-full bg-success" />
          <span>Core Engine Online</span>
        </div>

        <div className="h-4 w-px bg-border" />

        {adminPhone ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-sm bg-surface-sunken border border-border">
              <Shield className="size-3.5 text-interactive" />
              <span className="font-mono text-xs font-medium text-text">{adminPhone}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-xs bg-accent text-accent-ink uppercase tracking-wider">
                Admin
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out of console"
              className="p-1.5 text-text-subtle hover:text-danger rounded-sm transition-colors hover:bg-surface-sunken cursor-pointer"
              aria-label="Logout"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/30 text-amber-700">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[11px] font-medium">Unauthenticated</span>
            </div>
            <Button
              size="sm"
              variant="primary"
              icon={<LogIn className="size-3.5" />}
              onClick={onOpenLogin}
            >
              Sign In
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
