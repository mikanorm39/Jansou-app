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
  | "repeat_discard";

type VoiceClip = {
  relativePath: string;
  topFolder: string;
  fileName: string;
};

const CHARACTER_ALIAS: Record<string, string> = {
  ojousama: "zundamon",
  yankee: "robo",
  datsuryoku: "boy",
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
};

function randomPick<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
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

function listVoiceFiles(character: string): { clips: VoiceClip[]; basePath: string } {
  const mappedCharacter = CHARACTER_ALIAS[character] ?? character;
  const characterDir = path.join(VOICE_ROOT_DIR, mappedCharacter);

  if (fs.existsSync(characterDir)) {
    return {
      clips: collectClips(characterDir, characterDir),
      basePath: `/user-voices/${encodeURIComponent(mappedCharacter)}`,
    };
  }

  return {
    clips: collectClips(VOICE_ROOT_DIR, VOICE_ROOT_DIR),
    basePath: "/user-voices",
  };
}

function toPublicUrl(basePath: string, relativePath: string): string {
  const encodedPath = relativePath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${basePath}/${encodedPath}`;
}

function pickClip(clips: VoiceClip[], event: VoiceEvent): VoiceClip | null {
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

  const { clips, basePath } = listVoiceFiles(character);
  const clip = pickClip(clips, event);
  if (!clip) return NextResponse.json({ url: null });

  return NextResponse.json({
    url: toPublicUrl(basePath, clip.relativePath),
  });
}
