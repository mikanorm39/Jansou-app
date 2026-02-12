"use client";

import { useState } from "react";

export function TrainingInterface() {
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [characterName, setCharacterName] = useState("");
  const [status, setStatus] = useState("");

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("学習ジョブ開始リクエストを送信中...");

    const form = new FormData();
    if (voiceFile) form.append("voice", voiceFile);
    form.append("characterName", characterName);

    try {
      await fetch("/api/train", {
        method: "POST",
        body: form,
      });
      setStatus("学習ジョブのキックを受け付けました（API実装は別途）。");
    } catch {
      setStatus("学習ジョブの起動に失敗しました。");
    }
  };

  return (
    <section className="rounded-xl border border-dashed border-emerald-400/70 bg-black/30 p-4">
      <h2 className="text-xl font-bold">Training Interface (雛形)</h2>
      <p className="mt-1 text-sm text-emerald-100">新しい音声モデルを追加するためのアップロードUIです。</p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <input
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          placeholder="キャラクター名"
          className="rounded-md border border-emerald-500/60 bg-emerald-950/40 px-3 py-2"
        />
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setVoiceFile(e.target.files?.[0] ?? null)}
          className="rounded-md border border-emerald-500/60 bg-emerald-950/40 px-3 py-2"
        />
        <button type="submit" className="w-fit rounded-md bg-emerald-600 px-4 py-2 font-bold text-black hover:bg-emerald-500">
          学習開始
        </button>
      </form>

      {status && <p className="mt-3 text-sm text-amber-200">{status}</p>}
    </section>
  );
}
