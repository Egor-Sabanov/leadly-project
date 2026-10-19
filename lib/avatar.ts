import sharp from "sharp";
export const AVATAR_BUCKET = "leadly-profile-avatars";
export const AVATAR_INPUT_LIMIT = 2 * 1024 * 1024;
export async function normalizeAvatar(buffer: Buffer) {
  const image = sharp(buffer, {
    limitInputPixels: 16_000_000,
    failOn: "warning",
    animated: false,
  });
  const metadata = await image.metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format || "") ||
    (metadata.pages || 1) > 1
  )
    throw new Error("Используй JPG, PNG или WebP без анимации.");
  return image
    .rotate()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toBuffer();
}
