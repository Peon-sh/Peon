import { redirect } from 'next/navigation';

export default function LegacyLlmsRedirectPage() {
  redirect('/settings/llm');
}
