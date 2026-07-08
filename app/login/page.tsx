'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { fetchApi } from '../../lib/utils';
import { toast } from 'sonner';
import { LogIn, Eye, EyeOff, ArrowRight, AtSign, Lock } from 'lucide-react';

function LoginPageContent() {
  const [ziName, setZiName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorFromQuery = searchParams.get('error');

  useEffect(() => {
    if (user) router.replace('/chat');
  }, [user, router]);

  useEffect(() => {
    if (errorFromQuery) {
      toast.error(decodeURIComponent(errorFromQuery));
      window.history.replaceState({}, '', '/login');
    }
  }, [errorFromQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ziName.trim() || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const res = await fetchApi('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailOrUsername: ziName.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      login(data.token, data.user);
      toast.success('Welcome back!');
      router.push('/chat');
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-3 sm:px-4 bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-48 sm:w-80 h-48 sm:h-80 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-40 -left-40 w-48 sm:w-80 h-48 sm:h-80 bg-primary/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] bg-gradient-radial from-primary/5 to-transparent rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        {/* Logo / Branding */}
        <div className="text-center mb-4 sm:mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden shadow-lg mb-2 sm:mb-3">
            <img src="/logo.png" alt="ZiChat Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            ZiChat
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Sign in with your ZiName to continue</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-xl sm:rounded-2xl p-5 sm:p-8 shadow-2xl border border-border">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ZiName */}
            <div className="space-y-1.5">
              <label htmlFor="ziName" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <AtSign className="h-4 w-4 text-muted-foreground" /> ZiName
              </label>
              <input
                id="ziName"
                type="text"
                placeholder="Enter your ZiName"
                value={ziName}
                onChange={(e) => setZiName(e.target.value)}
                disabled={loading}
                autoComplete="username"
                className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground transition-all focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-muted-foreground" /> Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full h-11 px-4 pr-11 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground transition-all focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign In
                </>
              )}
            </button>

            {/* Create account link */}
            <p className="text-center text-sm text-muted-foreground pt-1">
              Don&apos;t have a ZiName?{' '}
              <a
                href="https://zeename.onrender.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
              >
                Create ZiName <ArrowRight className="h-3 w-3" />
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
