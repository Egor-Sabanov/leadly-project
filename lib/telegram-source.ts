import { isRussianOpportunity } from "./opportunity-language";
import { isRecord } from "./request-guards";
/** Only public, explicitly authorized channel posts have a shareable source URL. */
export function normalizeTelegramPost(
  value: unknown,
  allowedChats: string[],
  kind: string,
) {
  if (!isRecord(value) || !isRecord(value.channel_post)) return null;
  const post = value.channel_post;
  const chat = post.chat;
  if (
    !isRecord(chat) ||
    chat.type !== "channel" ||
    !allowedChats.includes(String(chat.id)) ||
    typeof chat.username !== "string" ||
    !/^\w{5,32}$/.test(chat.username)
  )
    return null;
  if (
    !Number.isSafeInteger(post.message_id) ||
    Number(post.message_id) <= 0 ||
    typeof post.date !== "number" ||
    !Number.isFinite(post.date) ||
    post.date <= 0
  )
    return null;
  const content =
    typeof post.text === "string"
      ? post.text
      : typeof post.caption === "string"
        ? post.caption
        : "";
  if (
    !content.trim() ||
    !isRussianOpportunity({
      title: content.split("\n")[0],
      description: content,
    }) ||
    !["project", "job", "client"].includes(kind)
  )
    return null;
  const published = new Date(post.date * 1000);
  if (!Number.isFinite(published.getTime())) return null;
  return {
    title: content.trim().split("\n")[0].slice(0, 300),
    description: content.trim().slice(0, 6000),
    url: `https://t.me/${chat.username}/${post.message_id}`,
    channel: String(chat.title || chat.username).slice(0, 200),
    chatId: String(chat.id),
    publishedAt: published.toISOString(),
    type: kind,
  };
}
