"use client";
import { useState } from "react";

export default function TitlePage() {
  const [gameState, setGameState] = useState<
    "title" | "char_select" | "playing"
  >("title");
  const [character, setCharacter] = useState("");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-green-900 text-white">
      {gameState === "title" && (
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-8">本格三人麻雀：実況</h1>
          <button
            onClick={() => setGameState("char_select")}
            className="px-8 py-4 bg-yellow-600 hover:bg-yellow-500 rounded-full text-2xl font-bold transition"
          >
            ゲーム開始
          </button>
        </div>
      )}

      {gameState === "char_select" && (
        <div className="text-center">
          <h2 className="text-4xl mb-8">実況キャラクターを選択</h2>
          <div className="flex gap-4">
            {["お嬢様", "ヤンキー", "脱力系男子"].map((char) => (
              <button
                key={char}
                onClick={() => {
                  setCharacter(char);
                  setGameState("playing");
                }}
                className="p-6 bg-white text-black rounded-lg hover:bg-gray-200"
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      )}

      {gameState === "playing" && (
        <div>
          <h2 className="text-2xl">対局中：実況担当 {character}</h2>
          {/* ここに麻雀盤面コンポーネントを入れる */}
        </div>
      )}
    </main>
  );
}
