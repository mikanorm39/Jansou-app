import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const VOICE_ROOT_DIR = path.join(process.cwd(), "public", "user-voices");

type VoiceEvent =
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

type VoiceClip = {
  relativePath: string;
  topFolder: string;
  fileName: string;
};

const CHARACTER_ALIAS: Record<string, string> = {
  ojousama: "zundamon",
  yankee: "robo",
  datsuryoku: "boy",
  mochiko: "girl",
  nimochiko: "girl",
};

const EVENT_FOLDERS: Record<VoiceEvent, string[]> = {
  preview: ["", "雑談"],
  start: ["対戦開始", "雑談", ""],
  reach: ["リーチ"],
  pon: ["ポン"],
  chi: ["チー"],
  kan: ["カン"],
  win: ["最終結果１位", "雑談", ""],
  ron: ["ロン"],
  tsumo: ["ツモ"],
  lose: ["CPUに上がられたとき", "雑談", ""],
  draw: ["雑談"],
  yaku: ["雑談", "追加役"],
  turn_hurry: ["思考中", "雑談"],
  repeat_discard: ["捨て牌のかぶり", "捨て牌同じ"],
  idle_chat: ["雑談"],
};

const EVENT_FILENAME_KEYWORDS: Record<VoiceEvent, string[]> = {
  preview: ["試聴", "自己紹介"],
  start: ["開始", "対局", "初め", "始め"],
  reach: ["リーチ"],
  pon: ["ポン"],
  chi: ["チー"],
  kan: ["カン"],
  win: ["勝っ", "やった", "1位", "最終", "勝ちセリフ"],
  ron: ["ロン"],
  tsumo: ["ツモ"],
  lose: ["負け", "やめる", "高い", "負けセリフ"],
  draw: ["流局"],
  yaku: ["役", "ドラ", "同順", "チャン", "通貫", "東", "西", "南", "北"],
  turn_hurry: ["考", "急", "早"],
  repeat_discard: ["同一", "パターン", "二度", "統一", "錯乱", "同じ"],
  idle_chat: [],
};

const idleChatRemainingByCharacter = new Map<string, string[]>();
const idleChatLastByCharacter = new Map<string, string>();

function randomPick<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function collectClips(baseDir: string, currentDir: string): VoiceClip[] {
  const clips: VoiceClip[] = [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      clips.push(...collectClips(baseDir, fullPath));
      continue;
    }
    if (!entry.isFile()) continue;

    const relativePath = path.relative(baseDir, fullPath);
    const parts = relativePath.split(path.sep);
    const topFolder = parts.length > 1 ? parts[0] : "";
    clips.push({ relativePath, topFolder, fileName: entry.name });
  }

  return clips;
}

function listVoiceFiles(
  character: string,
): { clips: VoiceClip[]; basePath: string; characterKey: string } | null {
  const mappedCharacter = CHARACTER_ALIAS[character] ?? character;
  const characterDir = path.join(VOICE_ROOT_DIR, mappedCharacter);

  if (!fs.existsSync(characterDir)) {
    return null;
  }

  return {
    clips: collectClips(characterDir, characterDir),
    basePath: `/user-voices/${encodeURIComponent(mappedCharacter)}`,
    characterKey: mappedCharacter,
  };
}

function toPublicUrl(basePath: string, relativePath: string): string {
  const encodedPath = relativePath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${basePath}/${encodedPath}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function yakuKeywords(yakuName: string): string[] {
  const compact = yakuName.replace(/\s+/g, "");
  const keywords: string[] = [compact];

  if (compact.includes("二色同順")) {
    keywords.push("にしょく同順", "二色同順");
  }
  if (compact.includes("ドラ隣")) {
    keywords.push("ドラ隣");
  }
  if (compact.includes("混全帯幺九")) {
    keywords.push("不純チャン", "チャン");
  }
  if (compact.includes("東西南北")) {
    keywords.push("東", "西", "南", "北");
  }
  if (compact.includes("無限立直") || compact.includes("無限リーチ")) {
    keywords.push("無限リーチ", "無限立直", "リーチ");
  }
  if (compact.includes("途中まで通貫") || compact.includes("一気通貫")) {
    keywords.push("途中まで通貫", "通貫");
  }

  return unique(keywords);
}

function pickYakuClip(clips: VoiceClip[], yakuName: string): VoiceClip | null {
  const yakuClips = clips.filter((clip) => clip.topFolder === "追加役");
  if (yakuClips.length === 0) return null;

  const keywords = yakuKeywords(yakuName);
  const matches = yakuClips.filter((clip) =>
    keywords.some((keyword) => clip.fileName.includes(keyword)),
  );

  return randomPick(matches);
}

function pickIdleChatClip(clips: VoiceClip[], characterKey: string): VoiceClip | null {
  const chatClips = clips.filter((clip) => clip.topFolder === "雑談");
  if (chatClips.length === 0) return null;

  const allPaths = chatClips.map((clip) => clip.relativePath);
  const allPathSet = new Set(allPaths);
  const currentRemaining = idleChatRemainingByCharacter.get(characterKey) ?? [];
  const filteredRemaining = currentRemaining.filter((relativePath) => allPathSet.has(relativePath));

  let remaining = filteredRemaining;
  if (remaining.length === 0) {
    const lastPlayed = idleChatLastByCharacter.get(characterKey);
    const refillSource = allPaths.filter((relativePath) => relativePath !== lastPlayed);
    remaining = shuffled(refillSource.length > 0 ? refillSource : allPaths);
  }

  const nextRelativePath = remaining[0];
  idleChatRemainingByCharacter.set(characterKey, remaining.slice(1));
  idleChatLastByCharacter.set(characterKey, nextRelativePath);

  return chatClips.find((clip) => clip.relativePath === nextRelativePath) ?? null;
}

function pickClip(
  clips: VoiceClip[],
  event: VoiceEvent,
  characterKey: string,
  yakuName?: string | null,
): VoiceClip | null {
  if (event === "yaku" && yakuName) {
    const yakuClip = pickYakuClip(clips, yakuName);
    if (yakuClip) return yakuClip;
    return null;
  }
  if (event === "idle_chat") {
    return pickIdleChatClip(clips, characterKey);
  }

  const folders = EVENT_FOLDERS[event];
  const folderCandidates = clips.filter((clip) => folders.includes(clip.topFolder));
  const keywords = EVENT_FILENAME_KEYWORDS[event];
  const fileCandidates = clips.filter((clip) =>
    keywords.some((keyword) => clip.fileName.includes(keyword)),
  );

  const inPreferredFolders = fileCandidates.filter((clip) => folders.includes(clip.topFolder));
  const fromPreferredFolders = randomPick(inPreferredFolders);
  if (fromPreferredFolders) return fromPreferredFolders;

  const fromFileName = randomPick(fileCandidates);
  if (fromFileName) return fromFileName;

  const fromFolder = randomPick(folderCandidates);
  if (fromFolder) return fromFolder;

  if (event !== "preview") {
    const chatFallback = clips.filter((clip) => clip.topFolder === "雑談");
    const fromChat = randomPick(chatFallback);
    if (fromChat) return fromChat;
  }

  return randomPick(clips);
}

function isVoiceEvent(event: string): event is VoiceEvent {
  return event in EVENT_FOLDERS;
}

export async function GET(request: NextRequest) {
  const character = request.nextUrl.searchParams.get("character");
  const event = request.nextUrl.searchParams.get("event");
  const yakuName = request.nextUrl.searchParams.get("yaku");

  if (!character || !event) {
    return NextResponse.json(
      { error: "Missing required query params: character, event" },
      { status: 400 },
    );
  }
  if (!isVoiceEvent(event)) {
    return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
  }

  if (!fs.existsSync(VOICE_ROOT_DIR)) {
    return NextResponse.json(
      { error: `Voice directory not found: ${VOICE_ROOT_DIR}` },
      { status: 404 },
    );
  }

  const listed = listVoiceFiles(character);
  if (!listed) return NextResponse.json({ url: null });

  const { clips, basePath, characterKey } = listed;
  const clip = pickClip(clips, event, characterKey, yakuName);
  if (!clip) return NextResponse.json({ url: null });

  return NextResponse.json({
    url: toPublicUrl(basePath, clip.relativePath),
  });
}
