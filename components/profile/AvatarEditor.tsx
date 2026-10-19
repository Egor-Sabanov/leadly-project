"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  Camera,
  LoaderCircle,
  Trash2,
  RotateCcw,
  X,
  Hand,
  Check,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  AVATAR_PIXEL_LIMIT,
  AVATAR_SELECTION_LIMIT,
  avatarCropArea,
  defaultAvatarCrop,
  type AvatarCrop,
} from "@/lib/avatar-crop";
type Photo = { url: string; image: HTMLImageElement };
export function AvatarEditor({
  name,
  initialUrl = "",
  enabled = true,
}: {
  name: string;
  initialUrl?: string | null;
  enabled?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true),
    drag = useRef<{ x: number; y: number; crop: AvatarCrop } | null>(null);
  const [url, setUrl] = useState(
    initialUrl?.startsWith("/api/profile/avatar?") ? initialUrl : "",
  );
  const [photo, setPhoto] = useState<Photo | null>(null),
    [crop, setCrop] = useState<AvatarCrop>(defaultAvatarCrop);
  const [reading, setReading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [imageFailed, setImageFailed] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!photo || !node) return;
    node.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = previous;
      URL.revokeObjectURL(photo.url);
    };
  }, [photo]);
  function clearSelection() {
    if (!busy) {
      setPhoto(null);
      setCrop(defaultAvatarCrop);
      setError("");
    }
  }
  async function choose(file: File) {
    setError("");
    setMessage("");
    setConfirmDelete(false);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > AVATAR_SELECTION_LIMIT
    ) {
      setError("Выбери JPG, PNG или WebP до 5 МБ.");
      return;
    }
    setReading(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new window.Image();
      image.src = objectUrl;
      await image.decode();
      if (
        !image.naturalWidth ||
        image.naturalWidth * image.naturalHeight > AVATAR_PIXEL_LIMIT
      )
        throw new Error(
          "Фото слишком большое по разрешению. Используй изображение до 16 мегапикселей.",
        );
      if (!alive.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setCrop(defaultAvatarCrop);
      setPhoto({ url: objectUrl, image });
    } catch (caught) {
      URL.revokeObjectURL(objectUrl);
      if (alive.current)
        setError(
          caught instanceof Error && caught.message.includes("мегапиксел")
            ? caught.message
            : "Не удалось открыть фото. Попробуй другое изображение.",
        );
    } finally {
      if (alive.current) setReading(false);
    }
  }
  async function save(remove = false) {
    if (busy || (!remove && !photo)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let blob: Blob | undefined;
      if (!remove && photo) {
        const area = avatarCropArea(
          photo.image.naturalWidth,
          photo.image.naturalHeight,
          crop,
        );
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error(
            "Не удалось подготовить фото. Попробуй другой браузер.",
          );
        context.drawImage(
          photo.image,
          area.left,
          area.top,
          area.size,
          area.size,
          0,
          0,
          512,
          512,
        );
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error("Не удалось подготовить фото.")),
            "image/webp",
            0.9,
          ),
        );
      }
      const response = await fetch("/api/profile/avatar", {
        method: remove ? "DELETE" : "POST",
        ...(blob ? { headers: { "Content-Type": blob.type }, body: blob } : {}),
        signal: AbortSignal.timeout(30000),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Не удалось сохранить фото. Попробуй ещё раз.",
        );
      if (
        !remove &&
        (typeof body?.url !== "string" ||
          !body.url.startsWith("/api/profile/avatar?"))
      )
        throw new Error("Сервер не подтвердил сохранение. Попробуй ещё раз.");
      if (!alive.current) return;
      setUrl(remove ? "" : body.url);
      setPhoto(null);
      setImageFailed(false);
      setConfirmDelete(false);
      setMessage(remove ? "Фото удалено." : "Аватарка сохранена.");
      router.refresh();
    } catch (caught) {
      if (alive.current)
        setError(
          caught instanceof Error &&
            !["TimeoutError", "AbortError"].includes(caught.name)
            ? caught.message
            : "Сервер долго не отвечает. Попробуй сохранить ещё раз.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const previewStyle: CSSProperties = {
    objectPosition: `${crop.x}% ${crop.y}%`,
    transform: `scale(${crop.zoom})`,
    transformOrigin: `${crop.x}% ${crop.y}%`,
  };
  const currentImage =
    photo?.url ||
    (!imageFailed && url ? `${url}${reload ? `&reload=${reload}` : ""}` : "");
  return (
    <div className="avatar-editor" aria-busy={busy || reading}>
      <div className="avatar-preview">
        {currentImage ? (
          <Image
            unoptimized
            src={currentImage}
            alt="Твоя аватарка"
            width={80}
            height={80}
            style={photo ? previewStyle : undefined}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span>{name.trim().slice(0, 1).toLocaleUpperCase("ru") || "Л"}</span>
        )}
      </div>
      <div className="avatar-controls">
        <strong>Фото профиля</strong>
        <p id={`${id}-format`}>
          JPG, PNG или WebP до 5 МБ. Кадр можно выбрать перед сохранением.
        </p>
        <input
          ref={input}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Выбрать аватарку"
          aria-describedby={`${id}-format`}
          disabled={!enabled || busy || reading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void choose(file);
          }}
        />
        <div className="avatar-buttons">
          <button
            type="button"
            className="ghost"
            disabled={!enabled || busy || reading}
            onClick={() => input.current?.click()}
          >
            {reading ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Camera size={15} />
            )}
            {reading
              ? "Открываем фото…"
              : url
                ? "Изменить фото"
                : "Добавить фото"}
          </button>
          {url && (
            <button
              type="button"
              className="icon-btn"
              disabled={busy || reading}
              aria-label="Удалить аватарку"
              onClick={() => {
                setConfirmDelete(true);
                setError("");
                setMessage("");
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        {imageFailed && url && !photo && (
          <p className="avatar-image-error">
            Фото не загрузилось.{" "}
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setImageFailed(false);
                setReload((value) => value + 1);
              }}
            >
              Повторить
            </button>
          </p>
        )}
        {confirmDelete && (
          <div className="avatar-delete-confirm">
            <span>Удалить фото профиля?</span>
            <div>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void save(true)}
              >
                {busy ? "Удаляем…" : "Удалить фото"}
              </button>
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        )}
        {error && !photo && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="avatar-notice" role="status">
            <Check size={14} />
            {message}
          </p>
        )}
      </div>
      <dialog
        ref={dialog}
        className="avatar-crop-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else clearSelection();
        }}
      >
        <div className="avatar-crop-heading">
          <div>
            <span className="eyebrow">ФОТО ПРОФИЛЯ</span>
            <h2 id={`${id}-title`}>Выбери свой кадр</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Закрыть кадрирование"
            disabled={busy}
            onClick={clearSelection}
          >
            <X size={19} />
          </button>
        </div>
        <p id={`${id}-hint`} className="avatar-crop-hint">
          <Hand size={14} />
          Перемести фото или настрой положение ползунками.
        </p>
        <div
          className="avatar-crop-view"
          onPointerDown={(event) => {
            if (busy) return;
            drag.current = { x: event.clientX, y: event.clientY, crop };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current || busy) return;
            const box = event.currentTarget.getBoundingClientRect();
            setCrop({
              ...crop,
              x: Math.max(
                0,
                Math.min(
                  100,
                  drag.current.crop.x -
                    ((event.clientX - drag.current.x) / box.width) * 100,
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  100,
                  drag.current.crop.y -
                    ((event.clientY - drag.current.y) / box.height) * 100,
                ),
              ),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {photo && (
            <Image
              unoptimized
              src={photo.url}
              alt="Предпросмотр кадрирования"
              fill
              style={previewStyle}
              draggable={false}
            />
          )}
          <span className="avatar-crop-grid" aria-hidden="true" />
        </div>
        <div className="avatar-crop-sliders">
          {(
            [
              { key: "zoom", label: "Масштаб", min: 1, max: 3, step: 0.05 },
              { key: "x", label: "По горизонтали", min: 0, max: 100, step: 1 },
              { key: "y", label: "По вертикали", min: 0, max: 100, step: 1 },
            ] as const
          ).map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={crop[field.key]}
                disabled={busy}
                onChange={(event) =>
                  setCrop({ ...crop, [field.key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
        </div>
        {error && photo && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}
        <div className="avatar-crop-actions">
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => setCrop(defaultAvatarCrop)}
            aria-label="Сбросить кадр"
            title="Вернуть фото по центру"
          >
            <RotateCcw size={14} />
            <span>По центру</span>
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !photo}
            onClick={() => void save()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
            {busy ? "Сохраняем…" : "Сохранить фото"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
