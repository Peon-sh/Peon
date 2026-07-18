'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleButton } from '@/components/auth/google-button';
import { initiateSignup, completeSignup, resendOtp } from '@/services/api/auth';

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function startSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await initiateSignup(email);
      setStep('verify');
      toast.success('We sent a verification code to your email.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start signup');
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await completeSignup({ email, name, password, code });
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      router.replace('/onboarding');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight uppercase">Create your account</h1>
        <p className="text-muted-foreground text-sm">
          {step === 'details'
            ? 'Start deploying in minutes.'
            : `Enter the 6-digit code sent to ${email}.`}
        </p>
      </div>

      {step === 'details' ? (
        <>
          <GoogleButton label="Sign up with Google" />
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2">or</span>
            </div>
          </div>
          <form onSubmit={startSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                At least 8 characters, with upper, lower, and a number.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending code…' : 'Continue'}
            </Button>
          </form>
        </>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Verifying…' : 'Create account'}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={() => setStep('details')}
            >
              Back
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={async () => {
                await resendOtp(email, 'SIGNUP');
                toast.success('Code resent.');
              }}
            >
              Resend code
            </button>
          </div>
        </form>
      )}

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
