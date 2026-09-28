'use client';

import React from 'react';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface-sunken text-text">
      <TopBar />
      <div className="flex flex-1 min-w-0">
        <SideNav />
        <main className="flex-1 p-6 overflow-auto min-w-0">
          <div className="max-w-content-max mx-auto w-full flex flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
