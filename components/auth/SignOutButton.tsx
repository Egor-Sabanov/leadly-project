'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, LoaderCircle } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (!error) { router.replace('/auth'); router.refresh(); }
    else setBusy(false);
  }
  return <button className="icon-btn" type="button" onClick={signOut} disabled={busy} aria-label="Выйти из аккаунта" title="Выйти из аккаунта">{busy ? <LoaderCircle className="spin" size={17} /> : <LogOut size={17} aria-hidden="true" />}</button>;
}
