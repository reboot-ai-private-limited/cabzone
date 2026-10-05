'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, LogIn, LogOut, Shield } from 'lucide-react';
import { navSections } from './nav-items';
import { getStoredPhone, logout } from '../features/auth/lib/authApi';

interface SideNavProps {
  onOpenLogin?: () => void;
}

export function SideNav({ onOpenLogin }: SideNavProps = {}) {
  const pathname = usePathname();
  const [adminPhone, setAdminPhone] = useState<string | null>(null);

  useEffect(() => {
    setAdminPhone(getStoredPhone());
  }, []);

  const handleLogout = () => {
    logout();
    setAdminPhone(null);
    window.location.reload();
  };

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface-sunken flex flex-col justify-between min-h-[calc(100vh-3.5rem)] select-none">
      <div className="p-3 flex flex-col gap-5">
        {navSections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
              {section.title}
            </div>

            <nav className="flex flex-col gap-0.5 mt-0.5">
              {section.items.map((item) => {
                const active = item.activePattern
                  ? item.activePattern.test(pathname)
                  : pathname.startsWith(item.href);

                const Icon = item.icon;

                if (item.comingSoon) {
                  return (
                    <div
                      key={item.href}
                      aria-disabled="true"
                      title="Coming soon"
                      className="group flex items-center justify-between px-3 py-2 rounded-sm text-sm text-text-subtle/50 cursor-not-allowed border border-transparent"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon aria-hidden className="size-4 shrink-0 opacity-50" />
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[10px] font-medium tracking-tight opacity-0 group-hover:opacity-100 transition-opacity">
                        Coming soon
                      </span>
                    </div>
                  );
                }

                if (item.external) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2 rounded-sm text-sm text-text-subtle hover:text-text hover:bg-surface-muted transition-colors border border-transparent"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon aria-hidden className="size-4 shrink-0 text-text-subtle" />
                        <span>{item.label}</span>
                      </div>
                      <ExternalLink className="size-3 text-text-subtle" />
                    </a>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-sm text-sm transition-colors ${
                      active
                        ? 'bg-surface text-interactive font-medium border border-border'
                        : 'text-text-subtle hover:text-text hover:bg-surface-muted border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        aria-hidden
                        className={`size-4 shrink-0 ${active ? 'text-interactive' : 'text-text-subtle'}`}
                      />
                      <span>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-xs bg-accent text-accent-ink tracking-tight">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Admin Session Profile Footer */}
      <div className="p-3 border-t border-border bg-surface flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-7 rounded-sm bg-surface-muted border border-border flex items-center justify-center shrink-0">
            <Shield className="size-3.5 text-interactive" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-text truncate">
              {adminPhone ? 'Super Admin' : 'Guest Operator'}
            </span>
            <span className="text-[11px] font-mono text-text-subtle truncate">
              {adminPhone ?? 'Unauthenticated'}
            </span>
          </div>
        </div>

        {adminPhone ? (
          <button
            type="button"
            onClick={handleLogout}
            title="Log out of session"
            className="p-1.5 text-text-subtle hover:text-danger rounded-sm transition-colors hover:bg-surface-sunken cursor-pointer"
            aria-label="Logout"
          >
            <LogOut className="size-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenLogin}
            title="Sign in to session"
            className="px-2 py-1 text-xs font-semibold bg-interactive hover:bg-interactive-hover text-white rounded-sm transition-colors cursor-pointer flex items-center gap-1 shrink-0"
          >
            <LogIn className="size-3" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </aside>
  );
}
