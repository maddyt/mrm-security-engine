import type { Metadata } from 'next';
import { Shell } from '@/components/mrm/Shell';
import { MrmProvider } from '@/components/mrm/state';

export const metadata: Metadata = {
  title: 'MRM Security Engine | SR 11-7 audit binders, fair lending and AI threat guardrails',
  description: 'A model risk and security compliance adapter for US bank regulation: disparate impact testing, population drift, adversarial robustness and a hash-chained audit ledger, compiled into an SR 11-7 validation binder.',
};

export default function MrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <MrmProvider>
      <Shell>{children}</Shell>
    </MrmProvider>
  );
}
