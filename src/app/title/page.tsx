"use client";

import { useRouter } from "next/navigation";

export default function TitlePage() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#14532d_0%,#052e16_70%)] p-6 text-white">
      <section className="w-full max-w-3xl rounded-2xl border border-emerald-400/50 bg-black/35 p-6 shadow-2xl">
        <h1 className="text-4xl font-black tracking-wide md:text-5xl">三人麻雀 萬子あり</h1>
        <p className="mt-2 text-emerald-100">タイトル画面です。次に実況キャラと音声モデルを選択します。</p>
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => router.push("/voice-select")}
            className="rounded-xl bg-emerald-500 px-8 py-3 text-lg font-black text-black transition hover:bg-emerald-400"
          >
            キャラ・音声選択へ
          </button>
        </div>
      </section>
    </main>
  );
}
