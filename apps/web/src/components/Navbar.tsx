'use client';

import Link from 'next/link';
import { useAuth } from '@/app/providers';
import { Ticket, LayoutDashboard, QrCode, LogOut, LogIn, Compass } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 glass border-b border-zinc-800/80 px-4 lg:px-8 py-4 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-2 rounded-lg text-white group-hover:scale-105 transition-transform">
            <Ticket className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Gatepass
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/" className="text-sm font-medium text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors">
            <Compass className="w-4 h-4" />
            Explore
          </Link>
          
          <Link href="/lookup" className="text-sm font-medium text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors">
            <Ticket className="w-4 h-4" />
            My Tickets
          </Link>

          {user && (user.role === 'organizer' || user.role === 'staff') && (
            <Link href="/scan" className="text-sm font-medium text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors">
              <QrCode className="w-4 h-4" />
              Scan Portal
            </Link>
          )}

          {user && user.role === 'organizer' && (
            <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Link>
          )}
        </nav>

        {/* Authentication Controls */}
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs text-zinc-400 font-mono">{user.role.toUpperCase()}</span>
                <span className="text-sm font-medium text-zinc-200">{user.email}</span>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white text-sm transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Log Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-sm font-semibold shadow-lg hover:shadow-indigo-500/20 transition-all"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
