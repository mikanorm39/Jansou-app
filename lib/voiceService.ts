export type CommentaryEvent =
  | "preview"
  | "start"
  | "reach"
  | "pon"
  | "chi"
  | "kan"
  | "win"
  | "ron"
  | "tsumo"
  | "lose"
  | "draw"
  | "yaku"
  | "turn_hurry"
  | "repeat_discard";

const DUPLICATE_GUARD_MS = 1200;
const lastPlayedAt = new Map<string, number>();

async function playAudioFromUrl(url: string): Promise<void> {
  const audio = new Audio(url);
  await audio.play();
}

export async function playCommentary(
  event: CommentaryEvent,
  characterType: string,
): Promise<void> {
  try {
    const now = Date.now();
    const guardKey = `${characterType}:${event}`;
    const last = lastPlayedAt.get(guardKey);
    if (typeof last === "number" && now - last < DUPLICATE_GUARD_MS) {
      return;
    }
    lastPlayedAt.set(guardKey, now);

    const params = new URLSearchParams({
      character: characterType,
      event,
    });

    const response = await fetch(`/api/voice?${params.toString()}`, {
      method: "GET",
    });
    if (!response.ok) return;

    const data = (await response.json()) as { url?: string | null };
    if (!data.url) return;

    await playAudioFromUrl(data.url);
  } catch (error) {
    console.error("Voice playback failed:", error);
  }
}
