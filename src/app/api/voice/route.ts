import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const VOICE_ROOT_DIR = path.join(process.cwd(), "public", "user-voices");
const REPEAT_DISCARD_QUOTES = ["なんでまた", "君はいらないのだ"];

const EVENT_KEYWORDS: Record<string, string[]> = {
  preview: ["preview", "自己紹介", "はじめまして", "です。"],
  start: ["start", "開始", "よろしく"],
  reach: ["reach", "リーチ"],
  pon: ["pon", "ポン"],
  chi: ["chi", "チー"],
  kan: ["kan", "カン", "槓"],
  win: ["win", "勝っ", "やった", "ロン", "ツモ", "あがり", "上がり"],
  ron: ["ron", "ロン"],
  tsumo: ["tsumo", "ツモ", "勝っ", "やった"],
  lose: ["lose", "負け"],
  draw: ["draw", "流局"],
  yaku: ["yaku", "役"],
  turn_hurry: ["hurry", "考える", "急い", "早く"],
};

function randomPick<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function listVoiceFiles(character: string): { files: string[]; basePath: string } {
  const characterDir = path.join(VOICE_ROOT_DIR, character);
  const baseDir = fs.existsSync(characterDir) ? characterDir : VOICE_ROOT_DIR;

  const files = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const basePath = baseDir === characterDir ? `/user-voices/${character}` : "/user-voices";
  return { files, basePath };
}

function pickClip(fileNames: string[], event: string): string | null {
  const lowered = fileNames.map((name) => ({ name, lower: name.toLowerCase() }));

  if (event === "repeat_discard") {
    const candidates = lowered
      .filter((entry) => REPEAT_DISCARD_QUOTES.some((keyword) => entry.name.includes(keyword)))
      .map((entry) => entry.name);
    return randomPick(candidates);
  }

  const keywords = EVENT_KEYWORDS[event];
  if (!keywords) return null;

  const candidates = lowered
    .filter((entry) =>
      keywords.some((keyword) => entry.lower.includes(keyword.toLowerCase())),
    )
    .map((entry) => entry.name);

  return randomPick(candidates);
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

  if (!fs.existsSync(VOICE_ROOT_DIR)) {
    return NextResponse.json(
      { error: `Voice directory not found: ${VOICE_ROOT_DIR}` },
      { status: 404 },
    );
  }

  const { files, basePath } = listVoiceFiles(character);
  const clip = pickClip(files, event);
  if (!clip) return NextResponse.json({ url: null });

  return NextResponse.json({
    url: `${basePath}/${encodeURIComponent(clip)}`,
  });
}
