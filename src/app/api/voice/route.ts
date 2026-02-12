import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { characters } from "../../../../data/characters";

const GPT_SOVITS_ENDPOINT = "http://127.0.0.1:9880";
const SAMPLE_REFER_WAV = "GPT-SoVITS-v3lora-20250228/GPT_SoVITS/BigVGAN/demo/examples/queen_24k.wav";

function resolveLocalPath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export async function GET(request: NextRequest) {
  const text = request.nextUrl.searchParams.get("text");
  const character = request.nextUrl.searchParams.get("character");

  if (!text || !character) {
    return NextResponse.json(
      { error: "Missing required query params: text, character" },
      { status: 400 },
    );
  }

  try {
    // Ensure default reference voice exists before synthesis.
    const referPathRaw = process.env.GPT_SOVITS_REFER_WAV_PATH ?? SAMPLE_REFER_WAV;
    const referPath = resolveLocalPath(referPathRaw);
    if (!fs.existsSync(referPath)) {
      return NextResponse.json(
        {
          error: "Reference wav not found",
          detail: `Set GPT_SOVITS_REFER_WAV_PATH or place sample at: ${referPath}`,
        },
        { status: 500 },
      );
    }

    const referParams = new URLSearchParams({
      refer_wav_path: referPath,
      prompt_text: process.env.GPT_SOVITS_REFER_TEXT ?? "hello",
      prompt_language: process.env.GPT_SOVITS_REFER_LANG ?? "en",
    });
    const referResp = await fetch(`${GPT_SOVITS_ENDPOINT}/change_refer?${referParams.toString()}`);
    if (!referResp.ok) {
      const body = await referResp.text();
      return NextResponse.json(
        { error: `change_refer failed: ${referResp.status}`, detail: body },
        { status: 502 },
      );
    }

    const selected = characters.find((c) => c.id === character);
    if (selected?.model.gptModelPath && selected.model.sovitsModelPath) {
      const gptAbs = resolveLocalPath(selected.model.gptModelPath);
      const sovitsAbs = resolveLocalPath(selected.model.sovitsModelPath);
      if (fs.existsSync(gptAbs) && fs.existsSync(sovitsAbs)) {
        const modelParams = new URLSearchParams({
          gpt_model_path: gptAbs,
          sovits_model_path: sovitsAbs,
        });
        await fetch(`${GPT_SOVITS_ENDPOINT}/set_model?${modelParams.toString()}`);
      }
    }

    const params = new URLSearchParams({
      text,
      text_language: "ja",
    });

    const ttsResponse = await fetch(`${GPT_SOVITS_ENDPOINT}/?${params.toString()}`, {
      method: "GET",
    });

    if (!ttsResponse.ok) {
      const body = await ttsResponse.text();
      return NextResponse.json(
        { error: `TTS failed: ${ttsResponse.status}`, detail: body },
        { status: 502 },
      );
    }

    const arrayBuffer = await ttsResponse.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": ttsResponse.headers.get("content-type") ?? "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
