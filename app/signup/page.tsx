'use client';

import { useEffect } from 'react';

export default function SignupPage() {
  useEffect(() => {
    window.location.href = 'https://zeename.onrender.com/';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center animate-fade-in">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Redirecting to ZiName...</p>
      </div>
    </div>
  );
}
