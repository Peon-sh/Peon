import { redirect } from 'next/navigation';

/** App root redirects to login. Marketing lives on peon.sh. */
export default function RootPage() {
  redirect('/login');
}
