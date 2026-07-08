'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { getApiBase, fetchApi } from '../../lib/utils';
import { toast } from 'sonner';
import { LogIn, Eye, EyeOff, MessageSquare, ArrowRight, AtSign, Lock } from 'lucide-react';
import Link from 'next/link';

function LoginPageContent() {
  const [emailOrUsername, setEmailOrUsername] = useState('');
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
    if (!emailOrUsername.trim() || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const res = await fetchApi('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailOrUsername: emailOrUsername.trim(),
          emailOrUsernameOrPhone: emailOrUsername.trim(),
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

  const handleGoogleSignIn = async () => {
    // Redirect to backend Google OAuth
    window.location.href = `${getApiBase()}/auth/google`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 to-transparent rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        {/* Logo / Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl overflow-hidden shadow-lg mb-3">
            <img src="/logo.png" alt="ZiChat Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            ZiChat
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Sign in to continue chatting</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl p-8 shadow-2xl border border-border">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ZiName */}
            <div className="space-y-1.5">
              <label htmlFor="emailOrUsername" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <AtSign className="h-4 w-4 text-muted-foreground" /> ZiName (username)
              </label>
              <input
                id="emailOrUsername"
                type="text"
                placeholder="Enter your ZiName"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                disabled={loading}
                autoComplete="username"
                className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground transition-all focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-muted-foreground" /> Password
                </label>
                <Link href="/login" className="text-xs text-primary font-semibold hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
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

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase font-semibold">
                <span className="px-3 text-muted-foreground bg-card">Or continue with</span>
              </div>
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full h-11 rounded-xl border border-border bg-background text-foreground font-semibold hover:bg-accent transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>

            {/* Signup link */}
            <p className="text-center text-sm text-muted-foreground pt-2">
              Don&apos;t have a ZiName?{' '}
              <a href="https://https://zeename.onrender.com/" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline inline-flex items-center gap-1">
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
