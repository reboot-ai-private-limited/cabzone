'use client';

import React from 'react';
import Link from 'next/link';

export function TopBar() {
  return (
    <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-between z-30">
      <div className="flex items-center gap-3">
        <Link href="/zones" className="flex items-center gap-2 text-text hover:opacity-90 transition-opacity">
          <div className="size-7 rounded-sm bg-accent text-accent-ink flex items-center justify-center font-bold text-sm tracking-tight">
            C
          </div>
          <span className="font-semibold text-text text-md tracking-tight">Cabzone</span>
        </Link>
       
      </div>

      <div className="flex items-center gap-4 text-xs text-text-subtle">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" />
          <span>Core Engine Online</span>
        </div>
      </div>
    </header>
  );
}
