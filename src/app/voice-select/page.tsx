"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { characters } from "../../../data/characters";
import { playCommentary } from "../../../lib/voiceService";

export default function VoiceSelectPage() {
  const router = useRouter();
  const waitingBgmRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/sounds/hitori.wav");
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.25;
    waitingBgmRef.current = audio;

    void audio.play().catch(() => {
      // Ignore autoplay restrictions; playback can start after user interaction.
    });

    return () => {
      audio.pause();
      audio.currentTime = 0;
      waitingBgmRef.current = null;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#0f3f7a_0%,#05152b_70%)] p-6 text-white">
      <section className="w-full max-w-5xl rounded-2xl border border-cyan-400/50 bg-black/35 p-6 shadow-2xl">
        <h1 className="text-3xl font-black tracking-wide md:text-4xl">キャラ・音声選択</h1>
        <p className="mt-2 text-cyan-100">実況キャラクターを選ぶか、下のUIから音声モデル追加を行ってください。</p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {characters.map((character) => (
            <div key={character.id} className="rounded-xl border border-cyan-400/60 bg-cyan-900/20 p-4">
              <p className="text-xl font-bold">{character.name}</p>
              <p className="mt-2 text-sm text-cyan-100">{character.description}</p>
              <p className="mt-2 text-xs text-cyan-200">model: {character.model.sovitsModelPath ?? "未設定"}</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void playCommentary("preview", character.id)}
                  className="rounded-md bg-slate-200 px-3 py-2 text-sm font-bold text-black hover:bg-white"
                >
                  試聴
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/game?char=${character.id}`)}
                  className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-bold text-black hover:bg-cyan-300"
                >
                  このキャラで開始
                </button>
              </div>
            </div>
          ))}
        </div>

      </section>
    </main>
  );
}
