import scripts from "../data/scripts.json";

type EventKey = "start" | "reach" | "pon" | "kan" | "win" | "draw" | "yaku";
type ScriptMap = Record<string, Partial<Record<EventKey, string>>>;

export async function playVoice(text: string, characterType: string): Promise<void> {
  try {
    const params = new URLSearchParams({
      text,
      character: characterType,
    });

    const response = await fetch(`/api/voice?${params.toString()}`, {
      method: "GET",
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Voice API failed: ${response.status} ${detail}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url));
    await audio.play();
  } catch (error) {
    console.error("Voice playback failed:", error);
  }
}

export async function playCommentary(event: string, characterType: string): Promise<void> {
  const scriptMap = scripts as ScriptMap;
  const known = ["start", "reach", "pon", "kan", "win", "draw", "yaku"];
  const eventKey = (known.includes(event) ? event : "start") as EventKey;
  const line =
    scriptMap[characterType]?.[eventKey] ??
    scriptMap.default?.[eventKey] ??
    "対局が進行しています。";

  await playVoice(line, characterType);
}
