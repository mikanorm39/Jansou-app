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
let playbackQueue: Promise<void> = Promise.resolve();

export type PlayCommentaryOptions = {
  yakuName?: string;
};

async function playAudioFromUrl(url: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const audio = new Audio(url);
    const cleanup = () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      resolve();
    };
    const onEnded = () => cleanup();
    const onError = () => cleanup();

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    void audio.play().catch(() => {
      cleanup();
    });
  });
}

export async function playCommentary(
  event: CommentaryEvent,
  characterType: string,
  options?: PlayCommentaryOptions,
): Promise<void> {
  try {
    const now = Date.now();
    const yakuKey = options?.yakuName ? `:${options.yakuName}` : "";
    const guardKey = `${characterType}:${event}${yakuKey}`;
    const last = lastPlayedAt.get(guardKey);
    if (typeof last === "number" && now - last < DUPLICATE_GUARD_MS) {
      return;
    }
    lastPlayedAt.set(guardKey, now);

    const params = new URLSearchParams({
      character: characterType,
      event,
    });
    if (options?.yakuName) {
      params.set("yaku", options.yakuName);
    }

    const response = await fetch(`/api/voice?${params.toString()}`, {
      method: "GET",
    });
    if (!response.ok) return;

    const data = (await response.json()) as { url?: string | null };
    if (!data.url) return;
    const voiceUrl = data.url;

    playbackQueue = playbackQueue
      .catch(() => {})
      .then(() => playAudioFromUrl(voiceUrl));
    await playbackQueue;
  } catch (error) {
    console.error("Voice playback failed:", error);
  }
}
