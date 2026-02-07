export default function Home() {
  const checkKeys = () => {
    // 実際にはセキュリティ上ブラウザから直接は見えませんが、
    // サーバーサイドで動く時に必要だということを確認する準備です。
    console.log("OpenAI Key exists:", !!process.env.OPENAI_API_KEY);
    console.log("ElevenLabs Key exists:", !!process.env.ELEVENLABS_API_KEY);
    alert("コンソール（F12キー）を確認してください。trueと出れば準備OKです！");
  };

  return (
    <main className="p-24">
      <h1 className="text-2xl font-bold mb-4">雀騒プロジェクト始動！</h1>
      <button
        onClick={checkKeys}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        設定確認ボタン
      </button>
    </main>
  );
}
