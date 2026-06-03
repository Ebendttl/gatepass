'use client';

import { useState } from 'react';
import { useAuth } from '@/app/providers';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, UserPlus, ArrowRight, UserCircle2 } from 'lucide-react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'organizer' | 'staff'>('organizer');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register');
      }

      login(data.accessToken, data.user);
      
      // Redirect based on role
      if (data.user.role === 'organizer') {
        router.push('/dashboard');
      } else {
        router.push('/scan');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 min-h-[75vh]">
      <div className="w-full max-w-md p-8 rounded-2xl glass-premium border border-zinc-800 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-600/10 blur-3xl rounded-full" />
        
        <div className="relative z-10">
          <h2 className="text-3xl font-extrabold text-white mb-2 text-center tracking-tight">Create Account</h2>
          <p className="text-zinc-400 text-sm text-center mb-8">Start hosting events or scanning tickets in seconds</p>
          
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-950/30 border border-red-900/40 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Account Type</label>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <button
                  type="button"
                  onClick={() => setRole('organizer')}
                  className={`py-2 px-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    role === 'organizer'
                      ? 'bg-indigo-600/15 border-indigo-500 text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-300'
                  }`}
                >
                  <UserCircle2 className="w-4 h-4" />
                  Organizer
                </button>
                <button
                  type="button"
                  onClick={() => setRole('staff')}
                  className={`py-2 px-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    role === 'staff'
                      ? 'bg-indigo-600/15 border-indigo-500 text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-300'
                  }`}
                >
                  <UserCircle2 className="w-4 h-4" />
                  Scanning Staff
                </button>
              </div>
            </div>

            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl text-white outline-none text-sm placeholder-zinc-600 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl text-white outline-none text-sm placeholder-zinc-600 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-indigo-500/20"
            >
              {submitting ? 'Creating Account...' : 'Sign Up'}
              <UserPlus className="w-4 h-4" />
            </button>
          </form>

          <p className="mt-8 text-center text-zinc-500 text-xs">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-0.5">
              Sign In <ArrowRight className="w-3 h-3" />
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
