import { LogoWordmark } from '@/components/logo';
import { AttributionCapture } from '@/components/auth/attribution-capture';
import { marketingHref } from '@/lib/env';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <a href={marketingHref('/')} className="mb-8 inline-flex items-center">
        <LogoWordmark height={40} />
      </a>
      <AttributionCapture />
      <div className="bg-card border-border w-full max-w-[400px] rounded-xl border p-8">{children}</div>
    </div>
  );
}
