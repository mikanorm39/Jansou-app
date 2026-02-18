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
  | "repeat_discard"
  | "idle_chat";

const DUPLICATE_GUARD_MS = 1200;
const lastPlayedAt = new Map<string, number>();
let playbackQueue: Promise<void> = Promise.resolve();
let activePlaybackCount = 0;
let lastVoiceActivityAt = Date.now();

export type PlayCommentaryOptions = {
  yakuName?: string;
};

type CommentaryRequest = {
  event: CommentaryEvent;
  options?: PlayCommentaryOptions;
};

function markVoiceActivity() {
  lastVoiceActivityAt = Date.now();
}

export function getLastVoiceActivityAt(): number {
  return lastVoiceActivityAt;
}

export function isVoicePlaybackBusy(): boolean {
  return activePlaybackCount > 0;
}

function buildGuardKey(
  event: CommentaryEvent,
  characterType: string,
  options?: PlayCommentaryOptions,
): string {
  const yakuKey = options?.yakuName ? `:${options.yakuName}` : "";
  return `${characterType}:${event}${yakuKey}`;
}

function passDuplicateGuard(guardKey: string): boolean {
  const now = Date.now();
  const last = lastPlayedAt.get(guardKey);
  if (typeof last === "number" && now - last < DUPLICATE_GUARD_MS) {
    return false;
  }
  lastPlayedAt.set(guardKey, now);
  return true;
}

async function fetchCommentaryUrl(
  event: CommentaryEvent,
  characterType: string,
  options?: PlayCommentaryOptions,
): Promise<string | null> {
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
  if (!response.ok) return null;

  const data = (await response.json()) as { url?: string | null };
  return data.url ?? null;
}

async function playAudioFromUrl(url: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const audio = new Audio(url);
    let cleaned = false;
    activePlaybackCount += 1;
    markVoiceActivity();
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      activePlaybackCount = Math.max(0, activePlaybackCount - 1);
      markVoiceActivity();
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
    const guardKey = buildGuardKey(event, characterType, options);
    if (!passDuplicateGuard(guardKey)) {
      return;
    }
    const voiceUrl = await fetchCommentaryUrl(event, characterType, options);
    if (!voiceUrl) return;

    playbackQueue = playbackQueue
      .catch(() => {})
      .then(() => playAudioFromUrl(voiceUrl));
    await playbackQueue;
  } catch (error) {
    console.error("Voice playback failed:", error);
  }
}

export async function playCommentaryBatchInOrder(
  characterType: string,
  requests: CommentaryRequest[],
): Promise<void> {
  try {
    const targets = requests.filter((request) =>
      passDuplicateGuard(buildGuardKey(request.event, characterType, request.options)),
    );
    if (targets.length === 0) return;

    const urls = await Promise.all(
      targets.map((request) => fetchCommentaryUrl(request.event, characterType, request.options)),
    );

    for (const voiceUrl of urls) {
      if (!voiceUrl) continue;
      playbackQueue = playbackQueue
        .catch(() => {})
        .then(() => playAudioFromUrl(voiceUrl));
    }
    await playbackQueue;
  } catch (error) {
    console.error("Voice batch playback failed:", error);
  }
}
