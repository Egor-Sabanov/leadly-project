const { createClient } = require("@supabase/supabase-js");
(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Нужны Supabase URL и серверный ключ в защищённых настройках среды.",
    );
  const storage = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
  const id = "leadly-profile-avatars";
  const { data, error } = await storage.getBucket(id);
  if (data) {
    if (
      data.public ||
      !data.file_size_limit ||
      Number(data.file_size_limit) > 262144 ||
      !data.allowed_mime_types?.length ||
      !data.allowed_mime_types.every((x) => x === "image/webp")
    )
      throw new Error("Конфигурация существующего хранилища требует проверки.");
    console.log("Private avatar storage verified");
    return;
  }
  if (!error || ![400, 404].includes(Number(error.status)))
    throw new Error("Не удалось проверить хранилище.");
  const result = await storage.createBucket(id, {
    public: false,
    fileSizeLimit: 262144,
    allowedMimeTypes: ["image/webp"],
  });
  if (result.error) throw new Error("Не удалось создать закрытое хранилище.");
  console.log("Private avatar storage created");
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
