"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  evaluateHandTiles,
  isWinningHand,
} from "../../../lib/mahjong";
import { playCommentary } from "../../../lib/voiceService";
import { characters } from "../../../data/characters";

type MeldType = "pon" | "chi" | "kan";

type MeldState = {
  type: MeldType;
  tiles: TileType[];
  calledFrom?: PlayerWind;
  calledIndex?: number;
};

type PlayerState = {
  hand: TileType[];
  drawnTile: TileType | null;
  discards: TileType[];
  score: number;
  isReach: boolean;
  reachCount: number;
  ippatsuEligible: boolean;
  ippatsuPrimed: boolean;
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

type RankingEntry = {
  wind: PlayerWind;
  score: number;
  owner: string;
  seatLabel: string;
};

type GameOverOverlay = {
  reason: string;
  rankings: RankingEntry[];
};

type GameState = {
  players: Record<PlayerWind, PlayerState>;
  wall: TileType[];
  turn: PlayerWind;
  doraIndicator: TileType;
  roundWind: PlayerWind;
  userWind: PlayerWind;
  kyokuNumber: number;
  kyoku: string;
  honba: number;
  kyotaku: number;
  lastDiscard: { from: PlayerWind; tile: TileType } | null;
  prompt: ActionPrompt | null;
  winner: WinOverlay | null;
  drawReason: string | null;
  gameOver: GameOverOverlay | null;
};

const WINDS: PlayerWind[] = ["east", "south", "west"];
const CPU_ACTION_DELAY_MS = 1000;

function nextWind(wind: PlayerWind): PlayerWind {
  if (wind === "east") return "south";
  if (wind === "south") return "west";
  return "east";
}

function prevWind(wind: PlayerWind): PlayerWind {
  if (wind === "east") return "west";
  if (wind === "south") return "east";
  return "south";
}

function roundWindLabel(wind: PlayerWind): string {
  if (wind === "east") return "東";
  if (wind === "south") return "南";
  return "西";
}

function seatWindLabel(wind: PlayerWind): string {
  if (wind === "east") return "東家";
  if (wind === "south") return "南家";
  return "西家";
}

function formatKyoku(roundWind: PlayerWind, kyokuNumber: number): string {
  return `${roundWindLabel(roundWind)}${kyokuNumber}局`;
}

function rotateScores(scores: Record<PlayerWind, number>): Record<PlayerWind, number> {
  return {
    east: scores.west,
    south: scores.east,
    west: scores.south,
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    wall: [...state.wall],
    players: {
      east: {
        ...state.players.east,
        hand: [...state.players.east.hand],
        drawnTile: state.players.east.drawnTile,
        discards: [...state.players.east.discards],
        calledMelds: state.players.east.calledMelds.map((m) => ({ ...m, tiles: [...m.tiles] })),
        reachCount: state.players.east.reachCount,
        ippatsuEligible: state.players.east.ippatsuEligible,
        ippatsuPrimed: state.players.east.ippatsuPrimed,
      },
      south: {
        ...state.players.south,
        hand: [...state.players.south.hand],
        drawnTile: state.players.south.drawnTile,
        discards: [...state.players.south.discards],
        calledMelds: state.players.south.calledMelds.map((m) => ({ ...m, tiles: [...m.tiles] })),
        reachCount: state.players.south.reachCount,
        ippatsuEligible: state.players.south.ippatsuEligible,
        ippatsuPrimed: state.players.south.ippatsuPrimed,
      },
      west: {
        ...state.players.west,
        hand: [...state.players.west.hand],
        drawnTile: state.players.west.drawnTile,
        discards: [...state.players.west.discards],
        calledMelds: state.players.west.calledMelds.map((m) => ({ ...m, tiles: [...m.tiles] })),
        reachCount: state.players.west.reachCount,
        ippatsuEligible: state.players.west.ippatsuEligible,
        ippatsuPrimed: state.players.west.ippatsuPrimed,
      },
    },
  };
}

function clearIppatsu(state: GameState) {
  for (const wind of WINDS) {
    state.players[wind].ippatsuEligible = false;
    state.players[wind].ippatsuPrimed = false;
  }
}

function applyInfiniteReachBonus(
  deltas: Record<PlayerWind, number>,
  winner: PlayerWind,
  byTsumo: boolean,
  loser: PlayerWind | undefined,
  reachCount: number,
) {
  const multiplier = Math.max(0, reachCount - 1);
  if (multiplier <= 0) return;

  if (byTsumo) {
    if (winner === "east") {
      const pay = 2000 * multiplier;
      for (const wind of WINDS) {
        if (wind === winner) continue;
        deltas[wind] -= pay;
        deltas[winner] += pay;
      }
      return;
    }

    const eastPay = 2000 * multiplier;
    const childPay = 1000 * multiplier;
    for (const wind of WINDS) {
      if (wind === winner) continue;
      const pay = wind === "east" ? eastPay : childPay;
      deltas[wind] -= pay;
      deltas[winner] += pay;
    }
    return;
  }

  if (!loser) return;
  const ronPay = (winner === "east" ? 2000 : 1000) * multiplier;
  deltas[loser] -= ronPay;
  deltas[winner] += ronPay;
}

function drawTileIfNeeded(state: GameState, wind: PlayerWind): boolean {
  const player = state.players[wind];
  if (player.drawnTile) return true;
  if (player.hand.length % 3 !== 1) return true;

  const draw = state.wall.shift();
  if (!draw) {
    state.drawReason = "流局（山牌が尽きました）";
    return false;
  }

  player.drawnTile = draw;
  return true;
}

function fullHand(player: PlayerState): TileType[] {
  return player.drawnTile ? sortTiles([...player.hand, player.drawnTile]) : player.hand;
}

function removeOneTile(hand: TileType[], target: TileType): boolean {
  const idx = hand.indexOf(target);
  if (idx < 0) return false;
  hand.splice(idx, 1);
  return true;
}

function consumeDrawnTile(player: PlayerState) {
  if (!player.drawnTile) return;
  player.hand = sortTiles([...player.hand, player.drawnTile]);
  player.drawnTile = null;
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
      isIppatsu: state.players[winner].isReach && state.players[winner].ippatsuEligible,
      doraIndicator: state.doraIndicator,
      isMenzen: state.players[winner].calledMelds.length === 0,
      calledMelds: state.players[winner].calledMelds,
      reachCount: state.players[winner].reachCount,
      seatWind: winner,
      roundWind: state.roundWind,
    },
  });

  const deltas = { ...result.deltas };
  if (state.honba > 0) {
    const bonus = state.honba * 100;
    if (byTsumo) {
      for (const wind of WINDS) {
        if (wind === winner) continue;
        deltas[wind] -= bonus;
        deltas[winner] += bonus;
      }
    } else if (loser) {
      deltas[loser] -= bonus * 3;
      deltas[winner] += bonus * 3;
    }
  }

  if (state.kyotaku > 0) {
    deltas[winner] += state.kyotaku * 1000;
  }

  applyInfiniteReachBonus(
    deltas,
    winner,
    byTsumo,
    loser,
    state.players[winner].reachCount,
  );

  for (const wind of WINDS) {
    state.players[wind].score += deltas[wind];
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
  for (const wind of WINDS) {
    if (wind === state.userWind) continue;
    const cpu = state.players[wind];
    if (isWinningHand([...fullHand(cpu), discardedTile], 4 - cpu.calledMelds.length)) {
      return wind;
    }
  }
  return null;
}

function resolveCpuTurn(state: GameState): GameState {
  const next = cloneState(state);

  if (next.turn === next.userWind || next.prompt || next.winner || next.drawReason) {
    return next;
  }

  const wind = next.turn;
  if (!drawTileIfNeeded(next, wind)) return next;

  const cpu = next.players[wind];
  if (isWinningHand(fullHand(cpu), 4 - cpu.calledMelds.length)) {
    return settleWin(next, wind, true, undefined, fullHand(cpu));
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

  const cpuFull = fullHand(cpu);
  const reachDiscardIndex = cpu.calledMelds.length === 0 ? findReachDiscardIndex(cpuFull, false) : null;
  const discardIndex = reachDiscardIndex ?? chooseCpuDiscard(cpuFull, threateningDiscards);
  const tile = cpuFull[discardIndex];
  const declaredReachThisDiscard = reachDiscardIndex !== null;
  if (cpu.drawnTile && cpu.drawnTile === tile) {
    cpu.drawnTile = null;
  } else {
    removeOneTile(cpu.hand, tile);
    consumeDrawnTile(cpu);
  }
  cpu.discards.push(tile);
  next.lastDiscard = { from: wind, tile };
  if (reachDiscardIndex !== null) {
    if (!cpu.isReach) {
      cpu.score -= 1000;
      next.kyotaku += 1;
      cpu.isReach = true;
    }
    cpu.reachCount += 1;
    cpu.ippatsuPrimed = true;
    cpu.ippatsuEligible = false;
  }
  if (cpu.ippatsuPrimed) {
    cpu.ippatsuPrimed = false;
    cpu.ippatsuEligible = true;
  } else if (cpu.isReach && cpu.ippatsuEligible && !declaredReachThisDiscard) {
    cpu.ippatsuEligible = false;
  }

  const user = next.players[next.userWind];
  const ron = isWinningHand([...user.hand, tile], 4 - user.calledMelds.length);
  const pon = canPon(user.hand, tile);
  const kan = canKan(user.hand, tile);
  const canChiFromThisPlayer = wind === prevWind(next.userWind);
  const chi = canChiFromThisPlayer ? chiOptions(user.hand, tile) : [];

  if (ron || pon || kan || chi.length > 0) {
    next.prompt = { from: wind, tile, canPon: pon, canRon: ron, canKan: kan, chiOptions: chi };
    next.turn = next.userWind;
    return next;
  }

  next.turn = nextWind(wind);
  if (next.turn === next.userWind && !next.prompt && !next.winner && !next.drawReason) {
    drawTileIfNeeded(next, next.userWind);
  }

  return next;
}

function turnLabel(wind: PlayerWind): string {
  return seatWindLabel(wind);
}

function turnOwnerLabel(wind: PlayerWind, userWind: PlayerWind): string {
  if (wind === userWind) return "あなた";
  const order: PlayerWind[] = ["east", "south", "west"];
  const userIndex = order.indexOf(userWind);
  const windIndex = order.indexOf(wind);
  const cpuIndex = (windIndex - userIndex + order.length) % order.length;
  return cpuIndex === 1 ? "CPU1" : "CPU2";
}

function findReachDiscardIndex(hand: TileType[], alreadyReached: boolean): number | null {
  if (!canDeclareReach(hand, alreadyReached)) return null;
  for (let i = 0; i < hand.length; i += 1) {
    const next = [...hand.slice(0, i), ...hand.slice(i + 1)];
    if (calculateShanten(next) === 0) return i;
  }
  return null;
}

function buildRankings(state: GameState): RankingEntry[] {
  return [...WINDS]
    .map((wind) => ({
      wind,
      score: state.players[wind].score,
      owner: turnOwnerLabel(wind, state.userWind),
      seatLabel: seatWindLabel(wind),
    }))
    .sort((a, b) => b.score - a.score || WINDS.indexOf(a.wind) - WINDS.indexOf(b.wind));
}

function shouldEndGame(state: GameState): { end: boolean; reason: string } {
  const anyTobi = WINDS.some((wind) => state.players[wind].score <= 0);
  if (anyTobi) {
    return { end: true, reason: "飛び（持ち点が0点以下）" };
  }

  const isEastRound3 = state.roundWind === "east" && state.kyokuNumber === 3;
  if (isEastRound3) {
    return { end: true, reason: "東3局終了" };
  }

  return { end: false, reason: "" };
}

function createInitialState(options?: {
  roundWind?: PlayerWind;
  scores?: Record<PlayerWind, number>;
  honba?: number;
  kyotaku?: number;
  userWind?: PlayerWind;
  kyokuNumber?: number;
}): GameState {
  const roundWind = options?.roundWind ?? "east";
  const scores = options?.scores ?? { east: 35000, south: 35000, west: 35000 };
  const userWind = options?.userWind ?? "east";
  const kyokuNumber = options?.kyokuNumber ?? 1;
  const dealt = dealInitialHands();
  const wall = [...dealt.wall];
  const doraIndicator = wall[0] ?? "z1";

  const state: GameState = {
    players: {
      east: { hand: dealt.players.east, drawnTile: null, discards: [], score: scores.east, isReach: false, reachCount: 0, ippatsuEligible: false, ippatsuPrimed: false, calledMelds: [] },
      south: { hand: dealt.players.south, drawnTile: null, discards: [], score: scores.south, isReach: false, reachCount: 0, ippatsuEligible: false, ippatsuPrimed: false, calledMelds: [] },
      west: { hand: dealt.players.west, drawnTile: null, discards: [], score: scores.west, isReach: false, reachCount: 0, ippatsuEligible: false, ippatsuPrimed: false, calledMelds: [] },
    },
    wall,
    turn: "east",
    doraIndicator,
    roundWind,
    userWind,
    kyokuNumber,
    kyoku: formatKyoku(roundWind, kyokuNumber),
    honba: options?.honba ?? 0,
    kyotaku: options?.kyotaku ?? 0,
    lastDiscard: null,
    prompt: null,
    winner: null,
    drawReason: null,
    gameOver: null,
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

function isTenpai(player: PlayerState): boolean {
  const hand = fullHand(player);
  const shanten = calculateShanten(hand);
  return shanten !== null && shanten <= 0;
}

function buildDrawYakuSummary(state: GameState): Array<{ wind: PlayerWind; yaku: string[] }> {
  return WINDS.map((wind) => {
    const player = state.players[wind];
    const tiles = fullHand(player);
    if (!isWinningHand(tiles, 4 - player.calledMelds.length)) {
      return { wind, yaku: ["未和了"] };
    }

    const result = evaluateHandTiles(tiles, {
      isReach: player.isReach,
      isIppatsu: false,
      doraIndicator: state.doraIndicator,
      isMenzen: player.calledMelds.length === 0,
      calledMelds: player.calledMelds,
      reachCount: player.reachCount,
      byTsumo: false,
      seatWind: wind,
      roundWind: state.roundWind,
    });

    return { wind, yaku: result.yaku.length > 0 ? result.yaku : ["役なし"] };
  });
}

function dealerHasYaku(state: GameState): boolean {
  const dealer = state.players.east;
  const tiles = fullHand(dealer);
  if (!isWinningHand(tiles, 4 - dealer.calledMelds.length)) return false;
  const result = evaluateHandTiles(tiles, {
    isReach: dealer.isReach,
    isIppatsu: false,
    doraIndicator: state.doraIndicator,
    isMenzen: dealer.calledMelds.length === 0,
    calledMelds: dealer.calledMelds,
    reachCount: dealer.reachCount,
    byTsumo: false,
    seatWind: "east",
    roundWind: state.roundWind,
  });
  return result.yaku.some((name) => name !== "役なし");
}

function dealerHasMenzenTsumo(state: GameState): boolean {
  const dealer = state.players.east;
  if (dealer.calledMelds.length > 0) return false;
  const tiles = fullHand(dealer);
  if (!isWinningHand(tiles, 4 - dealer.calledMelds.length)) return false;
  const result = evaluateHandTiles(tiles, {
    isReach: dealer.isReach,
    isIppatsu: false,
    doraIndicator: state.doraIndicator,
    isMenzen: true,
    calledMelds: dealer.calledMelds,
    reachCount: dealer.reachCount,
    byTsumo: true,
    seatWind: "east",
    roundWind: state.roundWind,
  });
  return result.yaku.includes("門前ツモ");
}

export default function GamePage() {
  const searchParams = useSearchParams();
  const selectedChar = searchParams.get("char") ?? "ojousama";
  const initial = useMemo(() => createInitialState(), []);
  const [state, setState] = useState<GameState>(initial);
  const [scoreFlash, setScoreFlash] = useState(true);
  const [cpuActing, setCpuActing] = useState(false);
  const cpuTimerRef = useRef<number | null>(null);
  const hurryTimerRef = useRef<number | null>(null);
  const playedWinnerRef = useRef<string | null>(null);
  const playedDrawRef = useRef<string | null>(null);
  const playedGameOverRef = useRef<string | null>(null);
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
      !state.gameOver && state.turn === state.userWind && !state.prompt && !state.winner && !state.drawReason;

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
    if (state.gameOver || state.turn === state.userWind || state.prompt || state.winner || state.drawReason) return;
    scheduleCpuTurn();
  }, [state.turn, state.prompt, state.winner, state.drawReason, state.gameOver, cpuActing]);

  useEffect(() => {
    if (!state.winner) {
      playedWinnerRef.current = null;
      return;
    }

    const winnerKey = `${state.winner.winner}-${state.winner.byTsumo ? "tsumo" : "ron"}-${state.winner.pointLabel}`;
    if (playedWinnerRef.current === winnerKey) return;
    playedWinnerRef.current = winnerKey;

    if (state.winner.winner !== state.userWind) {
      void playCommentary("lose", selectedChar);
    }
  }, [state.winner, selectedChar]);

  useEffect(() => {
    if (!state.drawReason) {
      playedDrawRef.current = null;
      return;
    }

    const drawKey = `${state.kyoku}-${state.drawReason}`;
    if (playedDrawRef.current === drawKey) return;
    playedDrawRef.current = drawKey;
    void playCommentary("draw", selectedChar);
  }, [state.drawReason, state.kyoku, selectedChar]);

  useEffect(() => {
    if (!state.gameOver) {
      playedGameOverRef.current = null;
      return;
    }

    const gameOverKey = `${state.gameOver.reason}-${state.gameOver.rankings.map((entry) => `${entry.wind}:${entry.score}`).join(",")}`;
    if (playedGameOverRef.current === gameOverKey) return;
    playedGameOverRef.current = gameOverKey;

    if (state.gameOver.rankings[0]?.wind === state.userWind) {
      void playCommentary("win", selectedChar);
    }
  }, [state.gameOver, state.userWind, selectedChar]);

  const me = state.players[state.userWind];
  const meFullHand = fullHand(me);
  const currentCharacter = characters.find((c) => c.id === selectedChar);
  const topWind = nextWind(state.userWind);
  const leftWind = nextWind(topWind);
  const isTopTurn = state.turn === topWind && !state.prompt && !state.winner && !state.drawReason;
  const isLeftTurn = state.turn === leftWind && !state.prompt && !state.winner && !state.drawReason;
  const isUserTurn = state.turn === state.userWind && !state.prompt && !state.winner && !state.drawReason;
  const canReach = !state.prompt && !state.winner && !state.drawReason && state.turn === state.userWind && me.calledMelds.length === 0 && canDeclareReach(meFullHand, false);
  const canTsumo = !state.prompt && !state.winner && !state.drawReason && state.turn === state.userWind && isWinningHand(meFullHand, 4 - me.calledMelds.length);
  const concealedKans = !state.prompt && !state.winner && !state.drawReason && state.turn === state.userWind ? concealedKanOptions(meFullHand) : [];
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
  const discardByUser = async (index: number, fromDrawn = false) => {
    if (state.turn !== state.userWind || state.prompt || state.winner || state.drawReason) return;

    const draft = cloneState(state);
    const player = draft.players[draft.userWind];
    const tile = fromDrawn ? player.drawnTile : player.hand[index];
    if (!tile) return;
    const previousDiscard = draft.players[draft.userWind].discards.at(-1) ?? null;
    const isRepeatDiscard = previousDiscard === tile;
    const declaredReachThisDiscard = player.ippatsuPrimed;

    if (fromDrawn) {
      player.drawnTile = null;
    } else {
      player.hand.splice(index, 1);
      consumeDrawnTile(player);
    }
    player.discards.push(tile);
    draft.lastDiscard = { from: draft.userWind, tile };
    if (player.ippatsuPrimed) {
      player.ippatsuPrimed = false;
      player.ippatsuEligible = true;
    } else if (player.isReach && player.ippatsuEligible && !declaredReachThisDiscard) {
      player.ippatsuEligible = false;
    }

    const ronWinner = findCpuRonWinner(draft, tile);
    if (ronWinner) {
      setState(settleWin(draft, ronWinner, false, draft.userWind, [...draft.players[ronWinner].hand, tile]));
      return;
    }

    draft.turn = nextWind(draft.userWind);
    setState(draft);

    if (isRepeatDiscard) {
      await playCommentary("repeat_discard", selectedChar);
    }
  };

  const onReach = async () => {
    if (!canReach) return;
    setState((prev) => {
      const next = cloneState(prev);
      const player = next.players[next.userWind];
      if (!player.isReach) {
        player.score -= 1000;
        next.kyotaku += 1;
        player.isReach = true;
      }
      player.reachCount += 1;
      player.ippatsuPrimed = true;
      player.ippatsuEligible = false;
      return next;
    });
    await playCommentary("reach", selectedChar);
  };

  const onTsumo = async () => {
    if (!canTsumo) return;

    setState((prev) => {
      const next = cloneState(prev);
      return settleWin(next, next.userWind, true, undefined, fullHand(next.players[next.userWind]));
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
      const winningTiles = [...next.players[next.userWind].hand, prompt.tile];
      next.prompt = null;
      return settleWin(next, next.userWind, false, prompt.from, winningTiles);
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
      clearIppatsu(next);
      const tile = prompt.tile;
      next.players[next.userWind].hand = removeNTiles(next.players[next.userWind].hand, tile, 2);
      next.players[next.userWind].calledMelds.push({
        type: "pon",
        tiles: [tile, tile, tile],
        calledFrom: prompt.from,
        calledIndex: 0,
      });
      next.prompt = null;
      next.turn = next.userWind;
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
      clearIppatsu(next);
      const tile = prompt.tile;
      next.players[next.userWind].hand = removeNTiles(next.players[next.userWind].hand, tile, 3);
      next.players[next.userWind].calledMelds.push({
        type: "kan",
        tiles: [tile, tile, tile, tile],
        calledFrom: prompt.from,
        calledIndex: 0,
      });
      next.prompt = null;
      next.turn = next.userWind;
      drawTileIfNeeded(next, next.userWind);
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
      clearIppatsu(next);
      next.players[next.userWind].hand = removeSpecificTiles(next.players[next.userWind].hand, need);
      next.players[next.userWind].calledMelds.push({
        type: "chi",
        tiles: chiSet,
        calledFrom: prompt.from,
        calledIndex: chiSet.indexOf(target),
      });
      next.prompt = null;
      next.turn = next.userWind;
      return next;
    });

    await playCommentary("chi", selectedChar);
  };

  const onConcealedKan = async (tile: TileType) => {
    if (state.turn !== state.userWind || state.prompt || state.winner || state.drawReason) return;

    setState((prev) => {
      const next = cloneState(prev);
      clearIppatsu(next);
      consumeDrawnTile(next.players[next.userWind]);
      next.players[next.userWind].hand = removeNTiles(next.players[next.userWind].hand, tile, 4);
      next.players[next.userWind].calledMelds.push({ type: "kan", tiles: [tile, tile, tile, tile] });
      drawTileIfNeeded(next, next.userWind);
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
      if (next.turn === next.userWind) {
        drawTileIfNeeded(next, next.userWind);
      }
      return next;
    });
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_15%,#2f8f5b,#1f6f46_55%,#0f3f2a_85%,#08271b)] text-white">
      <section className="relative mx-auto h-screen w-full max-w-[1280px] p-3 md:p-6">
        <div className="absolute left-1/2 top-8 w-[58%] -translate-x-1/2 rounded-xl px-2 py-1 transition">
          <div className="mb-2 text-center text-xs text-blue-100">
            {seatWindLabel(topWind)} {turnOwnerLabel(topWind, state.userWind)} {isTopTurn ? "（打牌中）" : ""}
          </div>
          <DiscardRiver tiles={state.players[topWind].discards} className={`mx-auto rounded-lg bg-black/30 p-2 transition ${isTopTurn ? "ring-2 ring-amber-300/90 shadow-[0_0_24px_rgba(251,191,36,0.65)]" : ""}`} tileClass="h-9 w-7 rotate-180" />
        </div>

        <div className="absolute left-4 top-[calc(30%+78px)] -translate-y-1/2 rounded-xl px-2 py-2 transition">
          <div className="relative flex items-center justify-center rounded-xl px-2 py-2 transition">
            <div className="pointer-events-none absolute -left-6 top-1/2 z-20 -translate-y-1/2 rotate-90 whitespace-nowrap text-left text-xs text-blue-100">
              {seatWindLabel(leftWind)} {turnOwnerLabel(leftWind, state.userWind)} {isLeftTurn ? "（打牌中）" : ""}
            </div>
            <div className={`w-[20rem] rotate-90 origin-center rounded-xl transition ${isLeftTurn ? "ring-2 ring-amber-300/90 shadow-[0_0_24px_rgba(251,191,36,0.65)]" : ""}`}>
              <DiscardRiver tiles={state.players[leftWind].discards} className="rounded-lg bg-black/30 p-2" tileClass="h-9 w-7" />
            </div>
          </div>
        </div>

        <div className="absolute right-4 top-4 w-[420px] rounded-xl border border-cyan-400/40 bg-slate-950/70 p-3 shadow-2xl">
          <div className="grid grid-cols-4 gap-3 text-center text-xs">
            <div>
              <p className="text-cyan-200">局</p>
              <p className="text-lg font-bold">{state.kyoku}</p>
            </div>
            <div>
              <p className="text-cyan-200">場風</p>
              <p className="text-lg font-bold">{roundWindLabel(state.roundWind)}</p>
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

          <div className={`mt-3 grid grid-cols-3 gap-3 rounded-md border border-slate-700 p-2 text-center text-sm ${scoreFlash ? "animate-pulse" : ""}`}>
            <div className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 ${state.players[state.userWind].isReach ? "ring-1 ring-rose-300/70" : ""}`}>
              <span>{seatWindLabel(state.userWind)}（あなた） {state.players[state.userWind].score}</span>
              <span
                className={`h-[18px] rounded-full bg-gradient-to-r from-rose-500 to-amber-400 px-2.5 py-0.5 text-[10px] font-black tracking-widest text-black shadow-[0_0_12px_rgba(251,113,133,0.7)] ${state.players[state.userWind].isReach ? "" : "opacity-0"}`}
              >
                リーチ
              </span>
            </div>
            <div className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 ${state.players[topWind].isReach ? "ring-1 ring-rose-300/70" : ""}`}>
              <span>{seatWindLabel(topWind)}（{turnOwnerLabel(topWind, state.userWind)}） {state.players[topWind].score}</span>
              <span
                className={`h-[18px] rounded-full bg-gradient-to-r from-rose-500 to-amber-400 px-2.5 py-0.5 text-[10px] font-black tracking-widest text-black shadow-[0_0_12px_rgba(251,113,133,0.7)] ${state.players[topWind].isReach ? "" : "opacity-0"}`}
              >
                リーチ
              </span>
            </div>
            <div className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 ${state.players[leftWind].isReach ? "ring-1 ring-rose-300/70" : ""}`}>
              <span>{seatWindLabel(leftWind)}（{turnOwnerLabel(leftWind, state.userWind)}） {state.players[leftWind].score}</span>
              <span
                className={`h-[18px] rounded-full bg-gradient-to-r from-rose-500 to-amber-400 px-2.5 py-0.5 text-[10px] font-black tracking-widest text-black shadow-[0_0_12px_rgba(251,113,133,0.7)] ${state.players[leftWind].isReach ? "" : "opacity-0"}`}
              >
                リーチ
              </span>
            </div>
          </div>


          {state.kyotaku > 0 && <div className="mt-2 h-2 w-full animate-pulse rounded bg-rose-500" />}
        </div>

        <div className="absolute left-1/2 top-[60%] -translate-x-1/2">
          <DiscardRiver tiles={me.discards} className="mx-auto rounded-lg bg-black/30 p-2" tileClass="h-9 w-7" />
        </div>

        {(state.prompt || canReach || canTsumo || concealedKans.length > 0) && !state.winner && !state.drawReason && (
          <aside className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 rounded-xl border border-amber-300/50 bg-black/65 p-3">
            {state.prompt && (state.prompt.canPon || state.prompt.canKan || state.prompt.chiOptions.length > 0) && (
              <div className="mb-1 rounded-md border border-rose-400/70 bg-black/35 p-2">
                <div className="mb-1 text-center text-xs font-bold text-rose-200">対象牌</div>
                <div className="mx-auto w-fit rounded-md p-1 ring-2 ring-rose-400/90 shadow-[0_0_12px_rgba(251,113,133,0.55)]">
                  <Tile tile={state.prompt.tile} className="h-14 w-10" />
                </div>
              </div>
            )}
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

        <div className={`absolute bottom-2 left-1/2 w-[94%] -translate-x-1/2 rounded-xl border bg-black/35 p-3 md:p-4 transition ${isUserTurn ? "border-amber-300/90 shadow-[0_0_28px_rgba(251,191,36,0.6)]" : "border-emerald-300/40"}`}>
          <div className="mb-2 flex items-center justify-between text-sm text-emerald-100">
            <span>あなた（{seatWindLabel(state.userWind)}）{isUserTurn ? "（あなたの手番）" : ""} / シャンテン: {calculateShanten(meFullHand) ?? "-"}</span>
            <span>残り牌: {state.wall.length} / 実況: {currentCharacter?.name ?? selectedChar} / 手番: {turnLabel(state.turn)}（{turnOwnerLabel(state.turn, state.userWind)}）</span>
          </div>

          {cpuActing && state.turn !== state.userWind && !state.prompt && !state.winner && !state.drawReason && (
            <div className="mb-2 text-center text-xs text-amber-200">{turnLabel(state.turn)} CPUが打牌中...</div>
          )}

          <div className="flex items-end justify-center gap-2 overflow-x-auto pb-1">
            {me.hand.map((tile, index) => (
              <button key={`${tile}-${index}`} type="button" onClick={() => void discardByUser(index)} className="transition hover:-translate-y-1">
                <Tile tile={tile} />
              </button>
            ))}
            {me.drawnTile && (
              <button type="button" onClick={() => void discardByUser(-1, true)} className="ml-6 transition hover:-translate-y-1">
                <Tile tile={me.drawnTile} />
              </button>
            )}

            {me.calledMelds.map((meld, i) => (
              <div key={`meld-${i}`} className="ml-2 flex gap-1 rounded-md border-2 border-amber-300/90 bg-black/30 py-2 pl-2 pr-4 shadow-[0_0_10px_rgba(252,211,77,0.35)]">
                {meld.tiles.map((tile, j) => {
                  return (
                    <div key={`meld-tile-${i}-${j}`} className="relative">
                      <Tile tile={tile} className={`${j === meld.tiles.length - 1 ? "h-14 w-10 rotate-90" : "h-14 w-10"}`} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {state.winner && !state.gameOver && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
            <div className="w-full max-w-lg rounded-xl border border-amber-300/50 bg-slate-900 p-5">
              <h2 className="text-2xl font-black">{state.winner.winner === state.userWind ? "あなたの和了" : "CPUの和了"}</h2>
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
                  const endCheck = shouldEndGame(state);
                  if (endCheck.end) {
                    setState((prev) => ({
                      ...prev,
                      winner: null,
                      drawReason: null,
                      gameOver: {
                        reason: endCheck.reason,
                        rankings: buildRankings(prev),
                      },
                    }));
                    return;
                  }

                  const shouldRotateSeats =
                    state.winner ? state.winner.winner !== "east" || !dealerHasYaku(state) : false;
                  const nextKyokuNumber = shouldRotateSeats ? state.kyokuNumber + 1 : state.kyokuNumber;
                  const shouldAdvanceRoundWind = shouldRotateSeats && nextKyokuNumber > 3;
                  const nextRoundWind = shouldAdvanceRoundWind ? nextWind(state.roundWind) : state.roundWind;
                  const normalizedKyokuNumber = shouldAdvanceRoundWind ? 1 : nextKyokuNumber;
                  const nextHonba = state.winner?.winner === "east" ? state.honba + 1 : 0;
                  const nextKyotaku = 0;
                  const baseScores = {
                    east: state.players.east.score,
                    south: state.players.south.score,
                    west: state.players.west.score,
                  };
                  const nextScores = shouldRotateSeats ? rotateScores(baseScores) : baseScores;
                  const nextUserWind = shouldRotateSeats ? nextWind(state.userWind) : state.userWind;
                  const reset = createInitialState({
                    roundWind: nextRoundWind,
                    kyokuNumber: normalizedKyokuNumber,
                    scores: {
                      east: nextScores.east,
                      south: nextScores.south,
                      west: nextScores.west,
                    },
                    honba: nextHonba,
                    kyotaku: nextKyotaku,
                    userWind: nextUserWind,
                  });
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

        {state.drawReason && !state.winner && !state.gameOver && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
            <div className="w-full max-w-lg rounded-xl border border-sky-300/50 bg-slate-900 p-5">
              <h2 className="text-2xl font-black">流局</h2>
              <p className="mt-1 text-sky-200">{state.drawReason}</p>
              <div className="mt-4 space-y-2">
                {buildDrawYakuSummary(state).map((entry) => (
                  <div key={`draw-yaku-${entry.wind}`} className="rounded-md border border-slate-700 bg-black/30 px-3 py-2 text-sm">
                    <div className="font-bold">
                      {seatWindLabel(entry.wind)}（{turnOwnerLabel(entry.wind, state.userWind)}）
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {entry.yaku.map((name) => (
                        <span key={`${entry.wind}-${name}`} className="rounded bg-sky-500/20 px-2 py-1 text-xs text-sky-100">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const endCheck = shouldEndGame(state);
                  if (endCheck.end) {
                    setState((prev) => ({
                      ...prev,
                      winner: null,
                      drawReason: null,
                      gameOver: {
                        reason: endCheck.reason,
                        rankings: buildRankings(prev),
                      },
                    }));
                    return;
                  }

                  const eastTenpai = isTenpai(state.players.east);
                  const shouldRotateSeats = !eastTenpai && !dealerHasMenzenTsumo(state);
                  const nextKyokuNumber = shouldRotateSeats ? state.kyokuNumber + 1 : state.kyokuNumber;
                  const shouldAdvanceRoundWind = shouldRotateSeats && nextKyokuNumber > 3;
                  const nextRoundWind = shouldAdvanceRoundWind ? nextWind(state.roundWind) : state.roundWind;
                  const normalizedKyokuNumber = shouldAdvanceRoundWind ? 1 : nextKyokuNumber;
                  const baseScores = {
                    east: state.players.east.score,
                    south: state.players.south.score,
                    west: state.players.west.score,
                  };
                  const nextScores = shouldRotateSeats ? rotateScores(baseScores) : baseScores;
                  const nextUserWind = shouldRotateSeats ? nextWind(state.userWind) : state.userWind;
                  const reset = createInitialState({
                    roundWind: nextRoundWind,
                    kyokuNumber: normalizedKyokuNumber,
                    scores: {
                      east: nextScores.east,
                      south: nextScores.south,
                      west: nextScores.west,
                    },
                    honba: state.honba + 1,
                    kyotaku: state.kyotaku,
                    userWind: nextUserWind,
                  });
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

        {state.gameOver && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-lg rounded-xl border border-emerald-300/60 bg-slate-900 p-5">
              <h2 className="text-2xl font-black">終局</h2>
              <p className="mt-1 text-emerald-200">{state.gameOver.reason}</p>
              <div className="mt-4 space-y-2">
                {state.gameOver.rankings.map((entry, index) => (
                  <div key={entry.wind} className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-black/40 px-3 py-2 text-sm">
                    <div>
                      <span className="mr-2 font-bold">{index + 1}位</span>
                      <span>{entry.seatLabel}（{entry.owner}）</span>
                    </div>
                    <div className="font-bold">{entry.score}</div>
                  </div>
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
                className="mt-5 rounded-md bg-emerald-500 px-4 py-2 font-bold text-black hover:bg-emerald-400"
              >
                新規開始
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
