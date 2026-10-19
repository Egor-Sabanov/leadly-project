export type AvatarCrop = { x: number; y: number; zoom: number };
export const defaultAvatarCrop: AvatarCrop = { x: 50, y: 50, zoom: 1 };
export const AVATAR_SELECTION_LIMIT = 5 * 1024 * 1024;
export const AVATAR_PIXEL_LIMIT = 16_000_000;
/** Match object-fit: cover with a percentage transform origin in the preview. */
export function avatarCropArea(
  width: number,
  height: number,
  crop: AvatarCrop,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    ![crop.x, crop.y, crop.zoom].every(Number.isFinite)
  )
    throw new RangeError("Некорректный размер фото.");
  const size = Math.min(width, height) / Math.max(1, Math.min(3, crop.zoom));
  return {
    left: ((width - size) * Math.max(0, Math.min(100, crop.x))) / 100,
    top: ((height - size) * Math.max(0, Math.min(100, crop.y))) / 100,
    size,
  };
}
