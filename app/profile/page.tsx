'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { fetchApi, getMediaUrl } from '../../lib/utils';
import { toast } from 'sonner';
import {
  User, AtSign, Mail, FileText, Camera, ArrowLeft,
  Check, MessageSquare, Loader2, Save
} from 'lucide-react';
import Link from 'next/link';

function ProfilePageContent() {
  const { user, loading: authLoading, updateUser, getToken } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
      return;
    }

    if (user) {
      setName(user.name || '');
      setUsername(user.username || '');
      setEmail(user.email || '');
      setBio(user.bio || '');
      setProfilePhoto(user.profilePhoto || '');
    }
  }, [user, authLoading, router]);

  const getInitials = (str: string) =>
    str?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be less than 10MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetchApi('/media', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Photo upload failed');
      }

      setProfilePhoto(data.url);
      toast.success('Profile photo uploaded!');
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedBio = bio.trim();

    if (!trimmedName) {
      toast.error('Please enter your full name');
      return;
    }
    if (!trimmedUsername || trimmedUsername.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await fetchApi('/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          username: trimmedUsername,
          bio: trimmedBio,
          profilePhoto,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      updateUser(data.user);
      toast.success('Profile updated successfully!');
      router.push('/chat');
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* Top Navbar */}
      <header className="w-full max-w-4xl mx-auto px-4 py-4 flex items-center justify-between relative z-10">
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border text-sm font-medium hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" /> Back to Chat
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden shadow-md">
            <img src="/logo.png" alt="ZiChat Logo" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-lg">ZiChat</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 relative z-10 animate-slide-up">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Edit Profile
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Customize your account identity, bio, and avatar
          </p>
        </div>

        {/* Profile Card */}
        <div className="bg-card rounded-2xl p-6 sm:p-8 shadow-2xl border border-border">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-28 h-28 rounded-full bg-primary/10 ring-4 ring-primary/20 shadow-lg flex items-center justify-center text-3xl font-bold text-primary overflow-hidden transition-all group-hover:ring-primary/40">
                  {profilePhoto ? (
                    <img src={getMediaUrl(profilePhoto) || ''} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(name || 'User')
                  )}
                  {uploadingPhoto && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 p-2.5 rounded-full bg-primary text-primary-foreground shadow-lg group-hover:scale-110 transition-transform">
                  <Camera className="h-4 w-4" />
                </div>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                {profilePhoto ? 'Change Photo' : 'Upload Profile Photo'}
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <User className="h-4 w-4 text-muted-foreground" /> Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground transition-all focus:ring-2 focus:ring-primary/30 text-sm"
                />
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <AtSign className="h-4 w-4 text-muted-foreground" /> Username
                </label>
                <input
                  id="username"
                  type="text"
                  placeholder="johndoe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                  disabled={loading}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground transition-all focus:ring-2 focus:ring-primary/30 text-sm"
                />
              </div>

              {/* Email (Read-Only) */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-muted-foreground" /> Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="w-full h-11 px-4 rounded-xl border border-border bg-muted/40 text-muted-foreground cursor-not-allowed text-sm"
                />
              </div>

              {/* Bio */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="bio" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-muted-foreground" /> Bio
                  </label>
                  <span className="text-[10px] text-muted-foreground">{bio.length}/200</span>
                </div>
                <textarea
                  id="bio"
                  placeholder="Tell others a bit about yourself..."
                  value={bio}
                  maxLength={200}
                  rows={3}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={loading}
                  className="w-full p-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground transition-all focus:ring-2 focus:ring-primary/30 text-sm resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading || uploadingPhoto}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    }>
      <ProfilePageContent />
    </Suspense>
  );
}
