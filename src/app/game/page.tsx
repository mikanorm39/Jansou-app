"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tile } from "../../components/Tile";
import type { PlayerWind, Tile as TileType } from "../../../types/mahjong";
import { dealInitialHands, sortTiles } from "../../../lib/shuffler";
import {
  calculateScoreResult,
  calculateShanten,
  canDeclareReach,
  canKan,
  canPon,
  chiOptions,
  chooseCpuDiscard,
  concealedKanOptions,
  isWinningHand,
} from "../../../lib/mahjong";
import { playCommentary } from "../../../lib/voiceService";
import { characters } from "../../../data/characters";

type MeldType = "pon" | "chi" | "kan";

type MeldState = {
  type: MeldType;
  tiles: TileType[];
};

type PlayerState = {
  hand: TileType[];
  discards: TileType[];
  score: number;
  isReach: boolean;
  calledMelds: MeldState[];
};

type ActionPrompt = {
  from: PlayerWind;
  tile: TileType;
  canPon: boolean;
  canRon: boolean;
  canKan: boolean;
  chiOptions: TileType[][];
};

type WinOverlay = {
  winner: PlayerWind;
  byTsumo: boolean;
  pointLabel: string;
  yaku: string[];
};

type GameState = {
  players: Record<PlayerWind, PlayerState>;
  wall: TileType[];
  turn: PlayerWind;
  doraIndicator: TileType;
  kyoku: string;
  honba: number;
  kyotaku: number;
  lastDiscard: { from: PlayerWind; tile: TileType } | null;
  prompt: ActionPrompt | null;
  winner: WinOverlay | null;
  drawReason: string | null;
};

const WINDS: PlayerWind[] = ["east", "south", "west"];
const CPU_ACTION_DELAY_MS = 1000;

function nextWind(wind: PlayerWind): PlayerWind {
  if (wind === "east") return "south";
  if (wind === "south") return "west";
  return "east";
}

function getInitialCharacter(): string {
  if (typeof window === "undefined") return "ojousama";
  const params = new URLSearchParams(window.location.search);
  return params.get("char") ?? "ojousama";
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    wall: [...state.wall],
    players: {
      east: {
        ...state.players.east,
        hand: [...state.players.east.hand],
        discards: [...state.players.east.discards],
        calledMelds: state.players.east.calledMelds.map((m) => ({ ...m, tiles: [...m.tiles] })),
      },
      south: {
        ...state.players.south,
        hand: [...state.players.south.hand],
        discards: [...state.players.south.discards],
        calledMelds: state.players.south.calledMelds.map((m) => ({ ...m, tiles: [...m.tiles] })),
      },
      west: {
        ...state.players.west,
        hand: [...state.players.west.hand],
        discards: [...state.players.west.discards],
        calledMelds: state.players.west.calledMelds.map((m) => ({ ...m, tiles: [...m.tiles] })),
      },
    },
  };
}

function drawTileIfNeeded(state: GameState, wind: PlayerWind): boolean {
  const player = state.players[wind];
  if (player.hand.length % 3 !== 1) return true;

  const draw = state.wall.shift();
  if (!draw) {
    state.drawReason = "流局（山牌が尽きました）";
    return false;
  }

  player.hand = sortTiles([...player.hand, draw]);
  return true;
}

function settleWin(
  state: GameState,
  winner: PlayerWind,
  byTsumo: boolean,
  loser: PlayerWind | undefined,
  winningTiles: TileType[],
): GameState {
  const result = calculateScoreResult({
    winner,
    loser,
    byTsumo,
    winningTiles,
    context: {
      isReach: state.players[winner].isReach,
      doraIndicator: state.doraIndicator,
      isMenzen: state.players[winner].calledMelds.length === 0,
      seatWind: winner,
      roundWind: "east",
    },
  });

  for (const wind of WINDS) {
    state.players[wind].score += result.deltas[wind];
  }

  state.winner = {
    winner,
    byTsumo,
    pointLabel: result.pointLabel,
    yaku: result.yaku,
  };

  return state;
}

function findCpuRonWinner(state: GameState, discardedTile: TileType): PlayerWind | null {
  for (const wind of ["south", "west"] as const) {
    const cpu = state.players[wind];
    if (isWinningHand([...cpu.hand, discardedTile])) {
      return wind;
    }
  }
  return null;
}

function resolveCpuTurn(state: GameState): GameState {
  const next = cloneState(state);

  if (next.turn === "east" || next.prompt || next.winner || next.drawReason) {
    return next;
  }

  const wind = next.turn;
  if (!drawTileIfNeeded(next, wind)) return next;

  const cpu = next.players[wind];
  if (isWinningHand(cpu.hand)) {
    return settleWin(next, wind, true, undefined, cpu.hand);
  }

  const threateningDiscards = new Set<TileType>();
  for (const opp of WINDS) {
    if (opp === wind) continue;
    if (next.players[opp].isReach) {
      for (const tile of next.players[opp].discards) {
        threateningDiscards.add(tile);
      }
    }
  }

  const discardIndex = chooseCpuDiscard(cpu.hand, threateningDiscards);
  const tile = cpu.hand[discardIndex];
  cpu.hand.splice(discardIndex, 1);
  cpu.discards.push(tile);
  next.lastDiscard = { from: wind, tile };

  const user = next.players.east;
  const ron = isWinningHand([...user.hand, tile]);
  const pon = canPon(user.hand, tile);
  const kan = canKan(user.hand, tile);
  const canChiFromThisPlayer = wind === "west";
  const chi = canChiFromThisPlayer ? chiOptions(user.hand, tile) : [];

  if (ron || pon || kan || chi.length > 0) {
    next.prompt = { from: wind, tile, canPon: pon, canRon: ron, canKan: kan, chiOptions: chi };
    next.turn = "east";
    return next;
  }

  next.turn = nextWind(wind);
  if (next.turn === "east" && !next.prompt && !next.winner && !next.drawReason) {
    drawTileIfNeeded(next, "east");
  }

  return next;
}

function turnLabel(wind: PlayerWind): string {
  if (wind === "east") return "東家";
  if (wind === "south") return "南家";
  return "西家";
}

function turnOwnerLabel(wind: PlayerWind): string {
  if (wind === "east") return "あなた";
  return "CPU";
}

function createInitialState(): GameState {
  const dealt = dealInitialHands();
  const wall = [...dealt.wall];
  const doraIndicator = wall[0] ?? "z1";

  const state: GameState = {
    players: {
      east: { hand: dealt.players.east, discards: [], score: 35000, isReach: false, calledMelds: [] },
      south: { hand: dealt.players.south, discards: [], score: 35000, isReach: false, calledMelds: [] },
      west: { hand: dealt.players.west, discards: [], score: 35000, isReach: false, calledMelds: [] },
    },
    wall,
    turn: "east",
    doraIndicator,
    kyoku: "東1局",
    honba: 0,
    kyotaku: 0,
    lastDiscard: null,
    prompt: null,
    winner: null,
    drawReason: null,
  };

  drawTileIfNeeded(state, "east");
  return state;
}

function removeNTiles(hand: TileType[], target: TileType, n: number): TileType[] {
  const next = [...hand];
  let removed = 0;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i] === target) {
      next.splice(i, 1);
      removed += 1;
      if (removed === n) break;
    }
  }
  return sortTiles(next);
}

function removeSpecificTiles(hand: TileType[], tilesToRemove: TileType[]): TileType[] {
  const next = [...hand];
  for (const tile of tilesToRemove) {
    const idx = next.indexOf(tile);
    if (idx >= 0) next.splice(idx, 1);
  }
  return sortTiles(next);
}

function DiscardRiver({ tiles, className, tileClass }: { tiles: TileType[]; className?: string; tileClass?: string }) {
  return (
    <div className={`w-fit ${className ?? ""}`}>
      <div className="grid grid-cols-8 gap-1">
        {tiles.map((tile, index) => (
          <Tile key={`${tile}-${index}`} tile={tile} className={tileClass} />
        ))}
      </div>
    </div>
  );
}

export default function GamePage() {
  const [selectedChar] = useState(getInitialCharacter);
  const initial = useMemo(() => createInitialState(), []);
  const [state, setState] = useState<GameState>(initial);
  const [scoreFlash, setScoreFlash] = useState(true);
  const [cpuActing, setCpuActing] = useState(false);
  const cpuTimerRef = useRef<number | null>(null);
  const hurryTimerRef = useRef<number | null>(null);
  const playedWinnerRef = useRef<string | null>(null);
  const discardSoundRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const currentBgmTrackRef = useRef<string | null>(null);
  const callSoundRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const callPromptVisibleRef = useRef(false);
  const winPromptVisibleRef = useRef(false);

  useEffect(() => {
    void playCommentary("start", selectedChar);
    const timer = window.setTimeout(() => setScoreFlash(false), 1100);
    return () => window.clearTimeout(timer);
  }, [selectedChar]);

  useEffect(() => {
    return () => {
      if (cpuTimerRef.current !== null) {
        window.clearTimeout(cpuTimerRef.current);
      }
      if (hurryTimerRef.current !== null) {
        window.clearInterval(hurryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const isPlayerThinking =
      state.turn === "east" && !state.prompt && !state.winner && !state.drawReason;

    if (!isPlayerThinking) {
      if (hurryTimerRef.current !== null) {
        window.clearInterval(hurryTimerRef.current);
        hurryTimerRef.current = null;
      }
      return;
    }

    if (hurryTimerRef.current !== null) {
      window.clearInterval(hurryTimerRef.current);
    }

    hurryTimerRef.current = window.setInterval(() => {
      void playCommentary("turn_hurry", selectedChar);
    }, 10000);

    return () => {
      if (hurryTimerRef.current !== null) {
        window.clearInterval(hurryTimerRef.current);
        hurryTimerRef.current = null;
      }
    };
  }, [state.turn, state.prompt, state.winner, state.drawReason, selectedChar]);

  useEffect(() => {
    const audio = new Audio("/sounds/notanomori_200812290000000026.wav");
    audio.preload = "auto";
    discardSoundRef.current = audio;

    return () => {
      discardSoundRef.current = null;
    };
  }, []);

  useEffect(() => {
    const callAudio = new Audio("/sounds/パパッ.mp3");
    callAudio.preload = "auto";
    callSoundRef.current = callAudio;

    const winAudio = new Audio("/sounds/きらーん2.mp3");
    winAudio.preload = "auto";
    winSoundRef.current = winAudio;

    return () => {
      callSoundRef.current = null;
      winSoundRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.25;
    bgmRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      bgmRef.current = null;
      currentBgmTrackRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = bgmRef.current;
    if (!audio) return;

    const inMatch = !state.winner && !state.drawReason;
    const nextTrack = inMatch
      ? state.players.east.isReach
        ? "/sounds/ghost.wav"
        : "/sounds/denno.wav"
      : null;

    if (!nextTrack) {
      audio.pause();
      audio.currentTime = 0;
      currentBgmTrackRef.current = null;
      return;
    }

    if (currentBgmTrackRef.current !== nextTrack) {
      audio.src = nextTrack;
      audio.currentTime = 0;
      currentBgmTrackRef.current = nextTrack;
    }

    if (audio.paused) {
      void audio.play().catch(() => {
        // Ignore autoplay restrictions; playback resumes after user interaction.
      });
    }
  }, [state.winner, state.drawReason, state.players.east.isReach]);

  useEffect(() => {
    if (!state.lastDiscard) return;

    const audio = discardSoundRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Ignore browser autoplay rejections and continue gameplay.
    });
  }, [state.lastDiscard]);

  const playSe = (audio: HTMLAudioElement | null) => {
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Ignore autoplay rejections and keep gameplay running.
    });
  };

  const scheduleCpuTurn = () => {
    if (cpuTimerRef.current !== null) {
      window.clearTimeout(cpuTimerRef.current);
    }
    setCpuActing(true);
    cpuTimerRef.current = window.setTimeout(() => {
      setState((prev) => resolveCpuTurn(prev));
      setCpuActing(false);
      cpuTimerRef.current = null;
    }, CPU_ACTION_DELAY_MS);
  };

  useEffect(() => {
    if (cpuActing) return;
    if (state.turn === "east" || state.prompt || state.winner || state.drawReason) return;
    scheduleCpuTurn();
  }, [state.turn, state.prompt, state.winner, state.drawReason, cpuActing]);

  useEffect(() => {
    if (!state.winner) {
      playedWinnerRef.current = null;
      return;
    }

    const winnerKey = `${state.winner.winner}-${state.winner.byTsumo ? "tsumo" : "ron"}-${state.winner.pointLabel}`;
    if (playedWinnerRef.current === winnerKey) return;
    playedWinnerRef.current = winnerKey;

    if (state.winner.winner !== "east") {
      void playCommentary("lose", selectedChar);
    }
  }, [state.winner, selectedChar]);

  const me = state.players.east;
  const currentCharacter = characters.find((c) => c.id === selectedChar);
  const isSouthTurn = state.turn === "south" && !state.prompt && !state.winner && !state.drawReason;
  const isWestTurn = state.turn === "west" && !state.prompt && !state.winner && !state.drawReason;
  const isEastTurn = state.turn === "east" && !state.prompt && !state.winner && !state.drawReason;
  const canReach = !state.prompt && !state.winner && !state.drawReason && state.turn === "east" && me.calledMelds.length === 0 && canDeclareReach(me.hand, me.isReach);
  const canTsumo = !state.prompt && !state.winner && !state.drawReason && state.turn === "east" && isWinningHand(me.hand);
  const concealedKans = !state.prompt && !state.winner && !state.drawReason && state.turn === "east" ? concealedKanOptions(me.hand) : [];
  const isCallPromptVisible = Boolean(
    canReach ||
    concealedKans.length > 0 ||
    state.prompt?.canPon ||
    state.prompt?.canKan ||
    (state.prompt?.chiOptions.length ?? 0) > 0,
  );
  const isWinPromptVisible = Boolean(canTsumo || state.prompt?.canRon);

  useEffect(() => {
    if (isCallPromptVisible && !callPromptVisibleRef.current) {
      playSe(callSoundRef.current);
    }
    callPromptVisibleRef.current = isCallPromptVisible;
  }, [isCallPromptVisible]);

  useEffect(() => {
    if (isWinPromptVisible && !winPromptVisibleRef.current) {
      playSe(winSoundRef.current);
    }
    winPromptVisibleRef.current = isWinPromptVisible;
  }, [isWinPromptVisible]);

  const discardByUser = async (index: number) => {
    if (state.turn !== "east" || state.prompt || state.winner || state.drawReason) return;

    const draft = cloneState(state);
    const tile = draft.players.east.hand[index];
    if (!tile) return;
    const isRepeatDiscard = draft.players.east.discards.includes(tile);

    draft.players.east.hand.splice(index, 1);
    draft.players.east.discards.push(tile);
    draft.lastDiscard = { from: "east", tile };

    const ronWinner = findCpuRonWinner(draft, tile);
    if (ronWinner) {
      setState(settleWin(draft, ronWinner, false, "east", [...draft.players[ronWinner].hand, tile]));
      return;
    }

    draft.turn = "south";
    setState(draft);

    if (isRepeatDiscard) {
      await playCommentary("repeat_discard", selectedChar);
    }
  };

  const onReach = async () => {
    if (!canReach) return;
    setState((prev) => {
      const next = cloneState(prev);
      next.players.east.isReach = true;
      next.players.east.score -= 1000;
      next.kyotaku += 1;
      return next;
    });
    await playCommentary("reach", selectedChar);
  };

  const onTsumo = async () => {
    if (!canTsumo) return;

    setState((prev) => {
      const next = cloneState(prev);
      return settleWin(next, "east", true, undefined, next.players.east.hand);
    });

    await playCommentary("tsumo", selectedChar);
    await playCommentary("yaku", selectedChar);
  };

  const onRon = async () => {
    if (!state.prompt?.canRon || state.winner || state.drawReason) return;

    setState((prev) => {
      const prompt = prev.prompt;
      if (!prompt) return prev;

      const next = cloneState(prev);
      const winningTiles = [...next.players.east.hand, prompt.tile];
      next.prompt = null;
      return settleWin(next, "east", false, prompt.from, winningTiles);
    });

    await playCommentary("ron", selectedChar);
    await playCommentary("yaku", selectedChar);
  };

  const onPon = async () => {
    if (!state.prompt?.canPon || state.winner || state.drawReason) return;

    setState((prev) => {
      const prompt = prev.prompt;
      if (!prompt) return prev;

      const next = cloneState(prev);
      const tile = prompt.tile;
      next.players.east.hand = removeNTiles(next.players.east.hand, tile, 2);
      next.players.east.calledMelds.push({ type: "pon", tiles: [tile, tile, tile] });
      next.prompt = null;
      next.turn = "east";
      return next;
    });

    await playCommentary("pon", selectedChar);
  };

  const onKan = async () => {
    if (!state.prompt?.canKan || state.winner || state.drawReason) return;

    setState((prev) => {
      const prompt = prev.prompt;
      if (!prompt) return prev;

      const next = cloneState(prev);
      const tile = prompt.tile;
      next.players.east.hand = removeNTiles(next.players.east.hand, tile, 3);
      next.players.east.calledMelds.push({ type: "kan", tiles: [tile, tile, tile, tile] });
      next.prompt = null;
      next.turn = "east";
      drawTileIfNeeded(next, "east");
      return next;
    });

    await playCommentary("kan", selectedChar);
  };

  const onChi = async (chiSet: TileType[]) => {
    if (!state.prompt || state.winner || state.drawReason) return;

    const target = state.prompt.tile;
    const need = chiSet.filter((t) => t !== target);

    setState((prev) => {
      const prompt = prev.prompt;
      if (!prompt) return prev;

      const next = cloneState(prev);
      next.players.east.hand = removeSpecificTiles(next.players.east.hand, need);
      next.players.east.calledMelds.push({ type: "chi", tiles: chiSet });
      next.prompt = null;
      next.turn = "east";
      return next;
    });

    await playCommentary("chi", selectedChar);
  };

  const onConcealedKan = async (tile: TileType) => {
    if (state.turn !== "east" || state.prompt || state.winner || state.drawReason) return;

    setState((prev) => {
      const next = cloneState(prev);
      next.players.east.hand = removeNTiles(next.players.east.hand, tile, 4);
      next.players.east.calledMelds.push({ type: "kan", tiles: [tile, tile, tile, tile] });
      drawTileIfNeeded(next, "east");
      return next;
    });

    await playCommentary("kan", selectedChar);
  };

  const onSkip = () => {
    setState((prev) => {
      const prompt = prev.prompt;
      if (!prompt) return prev;

      const next = cloneState(prev);
      next.prompt = null;
      next.turn = nextWind(prompt.from);
      if (next.turn === "east") {
        drawTileIfNeeded(next, "east");
      }
      return next;
    });
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_15%,#2f8f5b,#1f6f46_55%,#0f3f2a_85%,#08271b)] text-white">
      <section className="relative mx-auto h-screen w-full max-w-[1280px] p-3 md:p-6">
        <div className="absolute left-1/2 top-8 w-[58%] -translate-x-1/2 rounded-xl px-2 py-1 transition">
          <div className="mb-2 text-center text-xs text-blue-100">
            南家 CPU {isSouthTurn ? "（打牌中）" : ""}
          </div>
          <DiscardRiver tiles={state.players.south.discards} className={`mx-auto rounded-lg bg-black/30 p-2 transition ${isSouthTurn ? "ring-2 ring-amber-300/90 shadow-[0_0_24px_rgba(251,191,36,0.65)]" : ""}`} tileClass="h-9 w-7 rotate-180" />
        </div>

        <div className="absolute left-4 top-[calc(30%+78px)] -translate-y-1/2 rounded-xl px-2 py-2 transition">
          <div className="relative flex items-center justify-center rounded-xl px-2 py-2 transition">
            <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap text-left text-xs text-blue-100">
              西家 CPU {isWestTurn ? "（打牌中）" : ""}
            </div>
            <div className={`w-[20rem] rotate-90 origin-center rounded-xl transition ${isWestTurn ? "ring-2 ring-amber-300/90 shadow-[0_0_24px_rgba(251,191,36,0.65)]" : ""}`}>
              <DiscardRiver tiles={state.players.west.discards} className="rounded-lg bg-black/30 p-2" tileClass="h-9 w-7" />
            </div>
          </div>
        </div>

        <div className="absolute right-4 top-4 w-[360px] rounded-xl border border-cyan-400/40 bg-slate-950/70 p-3 shadow-2xl">
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div>
              <p className="text-cyan-200">局</p>
              <p className="text-lg font-bold">{state.kyoku}</p>
            </div>
            <div>
              <p className="text-cyan-200">本場 / 供託</p>
              <p className="text-lg font-bold">{state.honba} / {state.kyotaku}</p>
            </div>
            <div>
              <p className="text-cyan-200">ドラ表示</p>
              <div className="mt-1 flex justify-center">
                <Tile tile={state.doraIndicator} className="h-10 w-7" />
              </div>
            </div>
          </div>

          <div className={`mt-3 grid grid-cols-3 gap-2 rounded-md border border-slate-700 p-2 text-center text-sm ${scoreFlash ? "animate-pulse" : ""}`}>
            <div>東 {state.players.east.score}</div>
            <div>南 {state.players.south.score}</div>
            <div>西 {state.players.west.score}</div>
          </div>

          {state.kyotaku > 0 && <div className="mt-2 h-2 w-full animate-pulse rounded bg-rose-500" />}
        </div>

        <div className="absolute left-1/2 top-[60%] -translate-x-1/2">
          <DiscardRiver tiles={me.discards} className="mx-auto rounded-lg bg-black/30 p-2" tileClass="h-9 w-7" />
        </div>

        {(state.prompt || canReach || canTsumo || concealedKans.length > 0) && !state.winner && !state.drawReason && (
          <aside className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 rounded-xl border border-amber-300/50 bg-black/65 p-3">
            {state.prompt?.canPon && (
              <button type="button" onClick={onPon} className="rounded-md bg-orange-500 px-4 py-2 font-bold text-black hover:bg-orange-400">
                ポン
              </button>
            )}
            {state.prompt?.canKan && (
              <button type="button" onClick={onKan} className="rounded-md bg-violet-500 px-4 py-2 font-bold text-black hover:bg-violet-400">
                カン
              </button>
            )}
            {state.prompt?.chiOptions.map((opt, idx) => (
              <button key={`chi-${idx}`} type="button" onClick={() => void onChi(opt)} className="rounded-md bg-sky-500 px-4 py-2 font-bold text-black hover:bg-sky-400">
                チー {opt.join("-")}
              </button>
            ))}
            {canReach && (
              <button type="button" onClick={onReach} className="rounded-md bg-rose-600 px-4 py-2 font-bold hover:bg-rose-500">
                リーチ
              </button>
            )}
            {state.prompt?.canRon && (
              <button type="button" onClick={onRon} className="rounded-md bg-emerald-500 px-4 py-2 font-bold text-black hover:bg-emerald-400">
                ロン
              </button>
            )}
            {canTsumo && (
              <button type="button" onClick={onTsumo} className="rounded-md bg-cyan-500 px-4 py-2 font-bold text-black hover:bg-cyan-400">
                ツモ
              </button>
            )}
            {concealedKans.map((tile) => (
              <button key={`ankan-${tile}`} type="button" onClick={() => void onConcealedKan(tile)} className="rounded-md bg-indigo-500 px-4 py-2 font-bold text-black hover:bg-indigo-400">
                暗槓 {tile}
              </button>
            ))}
            {state.prompt && (
              <button type="button" onClick={onSkip} className="rounded-md bg-slate-500 px-4 py-2 font-bold hover:bg-slate-400">
                スキップ
              </button>
            )}
          </aside>
        )}

        <div className={`absolute bottom-2 left-1/2 w-[94%] -translate-x-1/2 rounded-xl border bg-black/35 p-3 md:p-4 transition ${isEastTurn ? "border-amber-300/90 shadow-[0_0_28px_rgba(251,191,36,0.6)]" : "border-emerald-300/40"}`}>
          <div className="mb-2 flex items-center justify-between text-sm text-emerald-100">
            <span>あなた（東家）{isEastTurn ? "（あなたの手番）" : ""} / シャンテン: {calculateShanten(me.hand) ?? "-"}</span>
            <span>残り牌: {state.wall.length} / 実況: {currentCharacter?.name ?? selectedChar} / 手番: {turnLabel(state.turn)}（{turnOwnerLabel(state.turn)}）</span>
          </div>

          {cpuActing && state.turn !== "east" && !state.prompt && !state.winner && !state.drawReason && (
            <div className="mb-2 text-center text-xs text-amber-200">{turnLabel(state.turn)} CPUが打牌中...</div>
          )}

          <div className="flex justify-center items-end gap-2 overflow-x-auto pb-1">
            {me.hand.map((tile, index) => (
              <button key={`${tile}-${index}`} type="button" onClick={() => void discardByUser(index)} className="transition hover:-translate-y-1">
                <Tile tile={tile} />
              </button>
            ))}

            {me.calledMelds.map((meld, i) => (
              <div key={`meld-${i}`} className="ml-2 flex gap-1 rounded-md border border-amber-400/60 bg-black/30 p-1">
                {meld.tiles.map((tile, j) => (
                  <Tile key={`meld-tile-${i}-${j}`} tile={tile} className={j === meld.tiles.length - 1 ? "h-14 w-10 rotate-90" : "h-14 w-10"} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {state.winner && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
            <div className="w-full max-w-lg rounded-xl border border-amber-300/50 bg-slate-900 p-5">
              <h2 className="text-2xl font-black">{state.winner.winner === "east" ? "あなたの和了" : "CPUの和了"}</h2>
              <p className="mt-1 text-amber-200">{state.winner.byTsumo ? "ツモ" : "ロン"} / {state.winner.pointLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {state.winner.yaku.map((name) => (
                  <span key={name} className="rounded bg-amber-500/20 px-2 py-1 text-sm text-amber-100">
                    {name}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const reset = createInitialState();
                  setState(reset);
                  setScoreFlash(true);
                  window.setTimeout(() => setScoreFlash(false), 1100);
                  void playCommentary("start", selectedChar);
                }}
                className="mt-5 rounded-md bg-cyan-500 px-4 py-2 font-bold text-black hover:bg-cyan-400"
              >
                次局へ
              </button>
            </div>
          </div>
        )}

        {state.drawReason && !state.winner && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
            <div className="w-full max-w-lg rounded-xl border border-sky-300/50 bg-slate-900 p-5">
              <h2 className="text-2xl font-black">流局</h2>
              <p className="mt-1 text-sky-200">{state.drawReason}</p>
              <button
                type="button"
                onClick={() => {
                  const reset = createInitialState();
                  setState(reset);
                  setScoreFlash(true);
                  window.setTimeout(() => setScoreFlash(false), 1100);
                }}
                className="mt-5 rounded-md bg-sky-500 px-4 py-2 font-bold text-black hover:bg-sky-400"
              >
                次局へ
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
