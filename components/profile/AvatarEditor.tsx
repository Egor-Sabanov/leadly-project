"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
export function AvatarEditor({ name }: { name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      const db = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) return;
      const { data } = await db
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (live && data?.avatar_url?.startsWith("/api/profile/avatar?"))
        setUrl(data.avatar_url);
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function save(remove = false) {
    setBusy(true);
    setError("");
    try {
      const result = await fetch(
        "/api/profile/avatar",
        remove
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "Content-Type": file!.type },
              body: file,
            },
      );
      const body = await result.json();
      if (!result.ok) throw new Error(body.error);
      setUrl(remove ? "" : body.url);
      setFile(null);
      setPreview("");
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сохранить аватарку.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="avatar-editor">
      <div className="avatar-preview">
        {preview || url ? (
          <Image
            unoptimized
            src={preview || url}
            alt="Твоя аватарка"
            width="80"
            height="80"
            onError={() => {
              setUrl("");
              setPreview("");
            }}
          />
        ) : (
          <span>{name.trim().slice(0, 1).toLocaleUpperCase("ru") || "Л"}</span>
        )}
      </div>
      <div className="avatar-controls">
        <strong>Твоя аватарка</strong>
        <p>JPG, PNG или WebP до 2 МБ. Квадратный кадр по центру.</p>
        <input
          ref={input}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Выбрать аватарку"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            setError("");
            if (!selected) return;
            if (
              !["image/jpeg", "image/png", "image/webp"].includes(
                selected.type,
              ) ||
              selected.size > 2 * 1024 * 1024
            ) {
              setError("Выбери JPG, PNG или WebP до 2 МБ.");
              e.target.value = "";
              return;
            }
            setFile(selected);
            setPreview(URL.createObjectURL(selected));
          }}
        />
        <div className="avatar-buttons">
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Camera size={15} />
            {url ? "Изменить" : "Добавить фото"}
          </button>
          {file && (
            <>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy && <LoaderCircle className="spin" size={15} />}Сохранить
                фото
              </button>
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setPreview("");
                }}
              >
                Отмена
              </button>
            </>
          )}
          {url && !file && (
            <button
              type="button"
              className="icon-btn"
              disabled={busy}
              aria-label="Удалить аватарку"
              onClick={() => void save(true)}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        {error && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
