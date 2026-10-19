'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';

interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface DemoCredential {
  role: string;
  email: string;
  password: string;
  initials: string;
  name: string;
}

const demoCredentials: DemoCredential[] = [
  { role: 'Clinical Coordinator', email: 'coordinator@happyhearts.uci.edu', password: 'HHCoord2026!', initials: 'SC', name: 'Sarah Chen' },
  { role: 'Research Admin', email: 'admin@happyhearts.uci.edu', password: 'HHAdmin2026!', initials: 'MR', name: 'Michael Reyes' },
];

export default function LoginClient() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>({
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleUseCredential = (cred: DemoCredential) => {
    setValue('email', cred.email);
    setValue('password', cred.password);
  };

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    // TODO: POST to /api/auth/login with data.email and data.password

    const valid = demoCredentials.find(c => c.email === data.email && c.password === data.password);
    if (!valid) {
      setLoading(false);
      setError('email', { message: "Invalid credentials — use the demo accounts below to sign in" });
      return;
    }
    toast.success(`Welcome back, ${valid.name}`);
    router.push('/');
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
          <p className="text-white/70 text-[13px]">Patient Engagement Platform</p>
        </div>

        <div className="relative">
          <h1 className="text-white font-700 text-[32px] leading-tight mb-4">
            Supporting patients<br />between clinic visits.
          </h1>
          <p className="text-white/80 text-[14px] leading-relaxed max-w-sm">
            Manage educational content, track patient engagement, respond to help requests, and monitor survey participation — all from one dashboard.
          </p>

          {/* Stats */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { value: '47', label: 'Active Patients' },
              { value: '7', label: 'Content Sessions' },
              { value: '61%', label: 'Completion Rate' },
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
            © 2026 HappyHearts · UCI Health Equity Nursing · Secure Staff Portal
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
            <h2 className="text-[26px] font-700 text-foreground">Staff sign in</h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              Access the HappyHearts clinical dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[13px] font-500 text-foreground mb-1">
                Email address
              </label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
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
                Password
              </label>
              <div className="relative">
                <input
                  {...register('password', { required: 'Password is required' })}
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={16} variant="outline" />
                </button>
              </div>
              {errors.password && <p className="text-[11px] text-danger mt-1">{errors.password.message}</p>}
            </div>

            {/* Remember me + forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  {...register('rememberMe')}
                  type="checkbox"
                  className="w-4 h-4 rounded border-border text-primary focus:ring-ring"
                />
                <span className="text-[13px] text-foreground">Remember me</span>
              </label>
              <button type="button" className="text-[13px] text-primary hover:underline font-500">
                Forgot password?
              </button>
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
                  Signing in...
                </>
              ) : 'Sign In to Dashboard'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-muted/50 rounded-xl border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="KeyIcon" size={14} variant="outline" className="text-muted-foreground" />
              <p className="text-[12px] font-600 text-muted-foreground uppercase tracking-wider">Demo Credentials</p>
            </div>
            <div className="space-y-2">
              {demoCredentials.map((cred) => (
                <div key={`cred-${cred.role}`} className="flex items-center gap-3 p-2.5 bg-card rounded-lg border border-border">
                  <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[10px] font-700 shrink-0">
                    {cred.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-600 text-foreground">{cred.role}</p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">{cred.email}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopy(cred.email, `email-${cred.role}`)}
                      title="Copy email"
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                    >
                      <Icon name={copiedField === `email-${cred.role}` ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={12} variant="outline" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(cred.password, `pw-${cred.role}`)}
                      title="Copy password"
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                    >
                      <Icon name={copiedField === `pw-${cred.role}` ? 'CheckIcon' : 'LockClosedIcon'} size={12} variant="outline" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUseCredential(cred)}
                      className="px-2.5 py-1 bg-primary/10 text-primary rounded-md text-[11px] font-600 hover:bg-primary/20 transition-colors duration-150"
                    >
                      Use
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-6">
            Staff-only access · Patient accounts are managed from the dashboard
          </p>
        </div>
      </div>
    </div>
  );
}