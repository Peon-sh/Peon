import { redirect } from 'next/navigation';

export default function LegacyInstanceSettingsPage() {
  redirect('/profile/instance');
}
