"use client";

import { useState } from "react";
import { LogOut, LoaderCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      // Discard cached private page payloads when the identity changes.
      window.location.replace("/auth");
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
