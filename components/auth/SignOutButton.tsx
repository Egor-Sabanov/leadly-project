"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LoaderCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      router.replace("/auth");
      router.refresh();
    } catch {
      setBusy(false);
      setError("Не удалось выйти. Попробуй ещё раз.");
    }
  }
  return (
    <>
      <button
        className="icon-btn"
        type="button"
        onClick={signOut}
        disabled={busy}
        aria-label="Выйти из аккаунта"
        title="Выйти из аккаунта"
      >
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <LogOut size={17} aria-hidden="true" />
        )}
      </button>
      {error && (
        <span role="alert" className="auth-message error">
          {error}
        </span>
      )}
    </>
  );
}
