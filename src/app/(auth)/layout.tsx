import { GitBranch, Server, ShieldCheck } from 'lucide-react';
import { LogoMark } from '@/components/logo';
import { AttributionCapture } from '@/components/auth/attribution-capture';
import { marketingHref } from '@/lib/env';

const HIGHLIGHTS = [
  { icon: Server, title: 'Bring your own servers', text: 'deploy to any linux box over ssh.' },
  { icon: GitBranch, title: 'Git-driven deploys', text: 'push to deploy from github or gitlab.' },
  { icon: ShieldCheck, title: 'Secrets encrypted at rest', text: 'app-layer encryption for every credential.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <a href={marketingHref('/')} className="mb-10 inline-flex items-center gap-2.5 font-semibold">
            <LogoMark size={32} />
            <span className="font-heading text-lg font-bold tracking-tight uppercase">
              Peon
            </span>
          </a>
          <AttributionCapture />
          {children}
        </div>
      </div>

      <div className="bg-card relative hidden overflow-hidden border-l lg:block">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="from-background/0 via-background/40 to-background absolute inset-0 bg-gradient-to-b" />
        <div className="relative flex h-full flex-col justify-end gap-8 p-12">
          <div className="space-y-3">
            <h2 className="font-heading text-3xl font-extrabold tracking-tight uppercase">
              Deploy anything, anywhere.
            </h2>
            <p className="text-muted-foreground max-w-md text-[12.5px] text-balance">
              <span className="text-phosphor">$ </span>
              self-host your apps, databases, and services on your own infrastructure with a
              world-class developer experience.
            </p>
          </div>
          <ul className="space-y-4">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex items-start gap-3">
                <span className="border-border-bright bg-secondary text-phosphor grid size-9 shrink-0 place-items-center rounded-md border">
                  <h.icon className="size-4" />
                </span>
                <div className="space-y-0.5">
                  <p className="text-[12.5px] font-semibold">{h.title}</p>
                  <p className="text-muted-foreground text-[11px]">{h.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
