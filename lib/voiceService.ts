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

async function playAudioFromUrl(url: string): Promise<void> {
  const audio = new Audio(url);
  await audio.play();
}

export async function playCommentary(
  event: CommentaryEvent,
  characterType: string,
): Promise<void> {
  try {
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
