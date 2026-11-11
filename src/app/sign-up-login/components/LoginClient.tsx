'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { AuthError, useAuth } from '@/contexts/AuthContext';
import { useStaffT } from '@/lib/i18n/staff/context';

interface LoginFormData {
  email: string;
  password: string;
}

function safeNext(raw: string | null) {
  // Only allow same-site relative paths.
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/messages';
  if (raw.startsWith('/sign-up-login')) return '/messages';
  return raw;
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const { signIn, isStaff, loading: authLoading } = useAuth();
  const { t } = useStaffT();
  const L = t.login;
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>({
    defaultValues: { email: '', password: '' },
  });

  // Already signed in as staff -> skip the form.
  useEffect(() => {
    if (!authLoading && isStaff) router.replace(next);
  }, [authLoading, isStaff, next, router]);

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    try {
      await signIn(data.email.trim(), data.password);
      toast.success(L.signedIn);
      router.replace(next);
    } catch (e) {
      const message =
        e instanceof AuthError ? e.message : L.unreachable;
      setError('password', { message });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary flex-col justify-between p-12 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div
              key={`circle-${i + 1}`}
              className="absolute rounded-full border-2 border-white"
              style={{
                width: `${(i + 1) * 120}px`,
                height: `${(i + 1) * 120}px`,
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%)`,
                opacity: 1 - i * 0.12,
              }}
            />
          ))}
        </div>

        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 rounded-xl p-2">
              <AppLogo size={32} />
            </div>
            <span className="text-white font-700 text-[20px] tracking-tight">HappyHearts</span>
          </div>
          <p className="text-white/70 text-[13px]">{L.platform}</p>
        </div>

        <div className="relative">
          <h1 className="text-white font-700 text-[32px] leading-tight mb-4">
            {L.headline1}<br />{L.headline2}
          </h1>
          <p className="text-white/80 text-[14px] leading-relaxed max-w-sm">
            {L.intro}
          </p>

          {/* Stats */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { value: '47', label: L.statPatients },
              { value: '7', label: L.statSessions },
              { value: '61%', label: L.statCompletion },
            ].map(stat => (
              <div key={`stat-${stat.label}`} className="bg-white/15 rounded-xl p-3 text-center">
                <p className="text-white font-700 text-[22px] tabular-nums">{stat.value}</p>
                <p className="text-white/70 text-[11px] mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <p className="text-white/50 text-[11px]">
            {L.footer}
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <AppLogo size={36} />
            <span className="font-700 text-[18px] text-foreground">HappyHearts</span>
          </div>

          <div className="mb-8">
            <h2 className="text-[26px] font-700 text-foreground">{L.title}</h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              {L.subtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">
                {L.email}
              </label>
              <input
                {...register('email', {
                  required: L.emailRequired,
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: L.emailInvalid },
                })}
                type="email"
                autoComplete="email"
                placeholder="you@happyhearts.uci.edu"
                className={`
                  w-full px-3.5 py-2.5 border rounded-lg text-[14px] text-foreground bg-background
                  placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors duration-150
                  ${errors.email ? 'border-danger focus:ring-danger/30' : 'border-border'}
                `}
              />
              {errors.email && <p className="text-[11px] text-danger mt-1">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">
                {L.password}
              </label>
              <div className="relative">
                <input
                  {...register('password', { required: L.passwordRequired })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  className={`
                    w-full px-3.5 py-2.5 border rounded-lg text-[14px] text-foreground bg-background
                    placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors duration-150 pr-10
                    ${errors.password ? 'border-danger focus:ring-danger/30' : 'border-border'}
                  `}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-100"
                  aria-label={showPassword ? L.hidePassword : L.showPassword}
                >
                  <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={16} variant="outline" />
                </button>
              </div>
              {errors.password && <p className="text-[11px] text-danger mt-1">{errors.password.message}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-600 hover:opacity-90 transition-all duration-150 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Icon name="ArrowPathIcon" size={16} variant="outline" className="animate-spin" />
                  {L.signingIn}
                </>
              ) : L.submit}
            </button>
          </form>

          <p className="text-center text-[11px] text-muted-foreground mt-6">
            {L.staffOnly}
          </p>
        </div>
      </div>
    </div>
  );
}