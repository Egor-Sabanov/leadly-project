import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { accountApi } from "@/lib/account-api";
import {
  AVATAR_BUCKET,
  AVATAR_INPUT_LIMIT,
  normalizeAvatar,
} from "@/lib/avatar";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function access(request: Request, mutation = false) {
  const auth = await accountApi(request, mutation);
  if (auth.error) {
    auth.error.headers.set("Cache-Control", "private, no-store");
    return { error: auth.error, account: null, admin: null };
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    return {
      error: NextResponse.json(
        {
          error:
            "Фото профиля сейчас недоступно. Остальные настройки можно сохранить.",
          code: "avatar_not_configured",
        },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      ),
      account: null,
      admin: null,
    };
  let avatarVersion = "";
  if (request.method === "GET") {
    const { data: profile, error } = await auth
      .account!.supabase.from("profiles")
      .select("avatar_url")
      .eq("id", auth.account!.user.id)
      .maybeSingle();
    if (error)
      return {
        error: NextResponse.json(
          { error: "Не удалось загрузить фото. Попробуй ещё раз." },
          { status: 503, headers: { "Cache-Control": "private, no-store" } },
        ),
        account: null,
        admin: null,
      };
    if (!profile?.avatar_url)
      return {
        error: new NextResponse(null, {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        }),
        account: null,
        admin: null,
      };
    avatarVersion = createHash("sha256")
      .update(profile.avatar_url)
      .digest("hex");
  }
  return {
    error: null,
    account: auth.account!,
    admin: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const target = new URL(
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          );
          // Storage's CDN can retain an overwritten or deleted object.
          // Use the saved profile version, independent of client query strings.
          if (avatarVersion && target.pathname.startsWith("/storage/v1/object/"))
            target.searchParams.set("v", avatarVersion);
          return fetch(target, {
            ...init,
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });
        },
      },
    }),
  };
}
export async function GET(request: Request) {
  const auth = await access(request);
  if (auth.error) return auth.error;
  const result = await auth
    .admin!.storage.from(AVATAR_BUCKET)
    .download(`${auth.account!.user.id}/avatar.webp`);
  if (result.error || !result.data) {
    const missing =
      result.error &&
      (/not.?found|does not exist|no_such_key/i.test(result.error.message) ||
        String(result.error.status) === "404");
    if (!missing)
      return NextResponse.json(
        { error: "Не удалось загрузить фото. Попробуй ещё раз." },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const buffer = Buffer.from(await result.data.arrayBuffer());
  const etag = '"' + createHash("sha256").update(buffer).digest("hex") + '"';
  const headers = {
    "Content-Type": "image/webp",
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag)
    return new NextResponse(null, { status: 304, headers });
  return new NextResponse(buffer, { headers });
}
export async function POST(request: Request) {
  const auth = await access(request, true);
  if (auth.error) return auth.error;
  if (
    !/^image\/(jpeg|png|webp)$/i.test(request.headers.get("content-type") || "")
  )
    return NextResponse.json(
      { error: "Используй изображение JPG, PNG или WebP." },
      { status: 415 },
    );
  if (Number(request.headers.get("content-length")) > AVATAR_INPUT_LIMIT)
    return NextResponse.json(
      { error: "Максимальный размер — 2 МБ." },
      { status: 413 },
    );
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json({ error: "Выбери изображение." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > AVATAR_INPUT_LIMIT) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Максимальный размер — 2 МБ." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let buffer: Buffer;
  try {
    buffer = await normalizeAvatar(Buffer.concat(chunks));
  } catch {
    return NextResponse.json(
      {
        error:
          "Не удалось прочитать изображение. Выбери JPG, PNG или WebP до 2 МБ.",
      },
      { status: 400 },
    );
  }
  if (buffer.length > 262144)
    return NextResponse.json(
      { error: "Попробуй изображение поменьше." },
      { status: 413 },
    );
  const { user, supabase } = auth.account!;
  const stored = await auth
    .admin!.storage.from(AVATAR_BUCKET)
    .upload(`${user.id}/avatar.webp`, buffer, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "0",
    });
  if (stored.error)
    return NextResponse.json(
      { error: "Не удалось сохранить аватарку. Попробуй позже." },
      { status: 503 },
    );
  const url = `/api/profile/avatar?v=${randomUUID()}`;
  const saved = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id)
    .select("id")
    .single();
  if (saved.error)
    return NextResponse.json(
      {
        error:
          "Изображение загружено, но профиль не обновлён. Повтори сохранение.",
      },
      { status: 503 },
    );
  revalidatePath("/profile");
  revalidatePath("/");
  return NextResponse.json(
    { url },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function DELETE(request: Request) {
  const auth = await access(request, true);
  if (auth.error) return auth.error;
  const { user, supabase } = auth.account!;
  const removed = await auth
    .admin!.storage.from(AVATAR_BUCKET)
    .remove([`${user.id}/avatar.webp`]);
  if (removed.error)
    return NextResponse.json(
      { error: "Не удалось удалить аватарку." },
      { status: 503 },
    );
  const saved = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id)
    .select("id")
    .single();
  if (saved.error)
    return NextResponse.json(
      { error: "Не удалось обновить профиль. Повтори удаление." },
      { status: 503 },
    );
  revalidatePath("/profile");
  revalidatePath("/");
  return NextResponse.json(
    { deleted: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
