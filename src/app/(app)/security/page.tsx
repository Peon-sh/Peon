import { redirect } from 'next/navigation';

/** Legacy path — Keys & Tokens moved to `/keys-and-tokens`. */
export default function SecurityRedirectPage() {
  redirect('/keys-and-tokens');
}
