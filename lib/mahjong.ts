import { buildThreePlayerDeck, fisherYatesShuffle, sortTiles } from "./shuffler";
import type { PlayerWind, Tile } from "../types/mahjong";

export const createDeck = (): Tile[] => fisherYatesShuffle(buildThreePlayerDeck());

export const sortHand = (hand: Tile[]): Tile[] => sortTiles(hand);

const TILE_TYPES: Tile[] = [
  "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9",
  "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9",
  "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9",
  "z1", "z2", "z3", "z4", "z5", "z6", "z7",
];

const YAOCHU_SET = new Set<Tile>([
  "m1", "m9", "p1", "p9", "s1", "s9",
  "z1", "z2", "z3", "z4", "z5", "z6", "z7",
]);

const DORA_NEXT: Record<Tile, Tile> = {
  m1: "m2", m2: "m3", m3: "m4", m4: "m5", m5: "m6", m6: "m7", m7: "m8", m8: "m9", m9: "m1",
  p1: "p2", p2: "p3", p3: "p4", p4: "p5", p5: "p6", p6: "p7", p7: "p8", p8: "p9", p9: "p1",
  s1: "s2", s2: "s3", s3: "s4", s4: "s5", s5: "s6", s6: "s7", s7: "s8", s8: "s9", s9: "s1",
  z1: "z2", z2: "z3", z3: "z4", z4: "z1", z5: "z6", z6: "z7", z7: "z5",
};

type MeldKind = "sequence" | "triplet";

type MeldPattern = {
  kind: MeldKind;
  index: number;
};

type HandPattern = {
  pairIndex: number;
  melds: MeldPattern[];
};

export type HandContext = {
  isReach: boolean;
  isIppatsu: boolean;
  doraIndicator: Tile;
  isMenzen: boolean;
  byTsumo: boolean;
  calledMelds?: Array<{ type: "pon" | "chi" | "kan"; tiles: Tile[] }>;
  reachCount?: number;
  seatWind?: PlayerWind;
  roundWind?: PlayerWind;
};

export type HandResult = {
  han: number;
  fu: number;
  yaku: string[];
  basePoints: number;
};

export type ScoreResult = {
  han: number;
  fu: number;
  yaku: string[];
  pointLabel: string;
  deltas: Record<PlayerWind, number>;
};

function tileToIndex(tile: Tile): number {
  const suit = tile[0];
  const rank = Number(tile[1]);

  if (suit === "m") return rank - 1;
  if (suit === "p") return 9 + rank - 1;
  if (suit === "s") return 18 + rank - 1;
  return 27 + rank - 1;
}

function toTile(index: number): Tile {
  if (index < 9) return `m${index + 1}` as Tile;
  if (index < 18) return `p${index - 8}` as Tile;
  if (index < 27) return `s${index - 17}` as Tile;
  return `z${index - 26}` as Tile;
}

function toCounts(tiles: Tile[]): number[] {
  const counts = Array.from({ length: 34 }, () => 0);
  for (const tile of tiles) {
    counts[tileToIndex(tile)] += 1;
  }
  return counts;
}

function isSuitIndex(index: number): boolean {
  return index < 27;
}

function isTerminalOrHonorIndex(index: number): boolean {
  if (index >= 27) return true;
  const rank = (index % 9) + 1;
  return rank === 1 || rank === 9;
}

function findMeldPatterns(counts: number[], acc: MeldPattern[] = []): MeldPattern[] | null {
  const i = counts.findIndex((v) => v > 0);
  if (i === -1) return acc;

  if (counts[i] >= 3) {
    counts[i] -= 3;
    const tripletTry = findMeldPatterns(counts, [...acc, { kind: "triplet", index: i }]);
    counts[i] += 3;
    if (tripletTry) return tripletTry;
  }

  if (isSuitIndex(i)) {
    const pos = i % 9;
    if (pos <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
      counts[i] -= 1;
      counts[i + 1] -= 1;
      counts[i + 2] -= 1;
      const seqTry = findMeldPatterns(counts, [...acc, { kind: "sequence", index: i }]);
      counts[i] += 1;
      counts[i + 1] += 1;
      counts[i + 2] += 1;
      if (seqTry) return seqTry;
    }
  }

  return null;
}

function findStandardHandPattern(tiles: Tile[], requiredMeldCount = 4): HandPattern | null {
  if (tiles.length % 3 !== 2) return null;

  const counts = toCounts(tiles);
  for (let i = 0; i < 34; i += 1) {
    if (counts[i] < 2) continue;

    counts[i] -= 2;
    const melds = findMeldPatterns(counts);
    counts[i] += 2;

    if (melds && melds.length === requiredMeldCount) {
      return { pairIndex: i, melds };
    }
  }

  return null;
}

export function isWinningHand(tiles: Tile[], requiredMeldCount = 4): boolean {
  return findStandardHandPattern(tiles, requiredMeldCount) !== null;
}

function canWinByOneDraw(thirteenTiles: Tile[]): boolean {
  for (const draw of TILE_TYPES) {
    if (isWinningHand([...thirteenTiles, draw], 4)) {
      return true;
    }
  }
  return false;
}

export function calculateShanten(hand: Tile[]): number | null {
  if (hand.length < 13) return null;

  if (hand.length % 3 === 2) {
    if (isWinningHand(hand, 4)) return -1;

    let best = 8;
    for (let i = 0; i < hand.length; i += 1) {
      const next = [...hand.slice(0, i), ...hand.slice(i + 1)];
      const s = calculateShanten(next);
      if (typeof s === "number") {
        best = Math.min(best, s);
      }
    }
    return best;
  }

  if (canWinByOneDraw(hand)) return 0;

  for (let d = 0; d < TILE_TYPES.length; d += 1) {
    const drawn = [...hand, TILE_TYPES[d]];
    for (let i = 0; i < drawn.length; i += 1) {
      const afterDiscard = [...drawn.slice(0, i), ...drawn.slice(i + 1)];
      if (canWinByOneDraw(afterDiscard)) {
        return 1;
      }
    }
  }

  return 2;
}

export function canDeclareReach(hand: Tile[], alreadyReached: boolean): boolean {
  if (alreadyReached || hand.length % 3 !== 2) return false;

  for (let i = 0; i < hand.length; i += 1) {
    const next = [...hand.slice(0, i), ...hand.slice(i + 1)];
    if (calculateShanten(next) === 0) {
      return true;
    }
  }

  return false;
}

export function canPon(hand: Tile[], target: Tile): boolean {
  let count = 0;
  for (const tile of hand) {
    if (tile === target) count += 1;
  }
  return count >= 2;
}

export function canKan(hand: Tile[], target: Tile): boolean {
  let count = 0;
  for (const tile of hand) {
    if (tile === target) count += 1;
  }
  return count >= 3;
}

export function concealedKanOptions(hand: Tile[]): Tile[] {
  const counts = toCounts(hand);
  const options: Tile[] = [];
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] === 4) options.push(toTile(i));
  }
  return options;
}

export function chiOptions(hand: Tile[], target: Tile): Tile[][] {
  if (target[0] === "z") return [];

  const suit = target[0] as "m" | "p" | "s";
  const rank = Number(target[1]);
  const set = new Set(hand);
  const options: Tile[][] = [];

  const candidates: Array<[number, number]> = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];

  for (const [a, b] of candidates) {
    if (a < 1 || b > 9) continue;
    const t1 = `${suit}${a}` as Tile;
    const t2 = `${suit}${b}` as Tile;
    if (set.has(t1) && set.has(t2)) {
      options.push(sortTiles([t1, target, t2]));
    }
  }

  return options;
}

export function chooseCpuDiscard(
  hand: Tile[],
  threateningDiscards: Set<Tile>,
): number {
  let bestIndex = 0;
  let bestShanten = Number.POSITIVE_INFINITY;
  let bestSafety = -1;

  for (let i = 0; i < hand.length; i += 1) {
    const tile = hand[i];
    const next = [...hand.slice(0, i), ...hand.slice(i + 1)];
    const s = calculateShanten(next) ?? 8;
    const safety = threateningDiscards.has(tile) ? 1 : 0;

    if (s < bestShanten || (s === bestShanten && safety > bestSafety)) {
      bestShanten = s;
      bestSafety = safety;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function countDora(tiles: Tile[], indicator: Tile): number {
  const dora = DORA_NEXT[indicator];
  return tiles.filter((tile) => tile === dora).length;
}

function nextTile(tile: Tile): Tile {
  return DORA_NEXT[tile];
}

function countDoraNeighbor(tiles: Tile[], indicator: Tile): number {
  const doraNeighbor = nextTile(nextTile(indicator));
  return tiles.filter((tile) => tile === doraNeighbor).length;
}

function isTanyao(tiles: Tile[]): boolean {
  return tiles.every((tile) => !YAOCHU_SET.has(tile));
}

function meldIsTerminalOrHonorRelated(meld: { type: "pon" | "chi" | "kan"; tiles: Tile[] }): boolean {
  if (meld.type === "chi") {
    return meld.tiles.some((tile) => YAOCHU_SET.has(tile));
  }
  return meld.tiles.length > 0 && YAOCHU_SET.has(meld.tiles[0]);
}

function countPatternSequencesBySuitAndStart(
  pattern: HandPattern,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const meld of pattern.melds) {
    if (meld.kind !== "sequence") continue;
    const suitBase = Math.floor(meld.index / 9);
    const suit = suitBase === 0 ? "m" : suitBase === 1 ? "p" : "s";
    const start = (meld.index % 9) + 1;
    map.set(`${suit}${start}`, (map.get(`${suit}${start}`) ?? 0) + 1);
  }
  return map;
}

function mergeOpenChiSequences(
  sequenceMap: Map<string, number>,
  calledMelds: Array<{ type: "pon" | "chi" | "kan"; tiles: Tile[] }>,
) {
  for (const meld of calledMelds) {
    if (meld.type !== "chi") continue;
    const sorted = [...meld.tiles].sort();
    const first = sorted[0];
    if (!first || first[0] === "z") continue;
    const suit = first[0] as "m" | "p" | "s";
    const start = Number(first[1]);
    if (Number.isNaN(start)) continue;
    const key = `${suit}${start}`;
    sequenceMap.set(key, (sequenceMap.get(key) ?? 0) + 1);
  }
}

function hasNishokuDojun(
  pattern: HandPattern,
  calledMelds: Array<{ type: "pon" | "chi" | "kan"; tiles: Tile[] }>,
): boolean {
  const sequenceMap = countPatternSequencesBySuitAndStart(pattern);
  mergeOpenChiSequences(sequenceMap, calledMelds);

  for (let start = 1; start <= 7; start += 1) {
    const suitsWithSameStart = ["m", "p", "s"].filter((suit) => (sequenceMap.get(`${suit}${start}`) ?? 0) > 0);
    if (suitsWithSameStart.length >= 2) {
      return true;
    }
  }

  return false;
}

function hasTochumadeTsukan(
  pattern: HandPattern,
  calledMelds: Array<{ type: "pon" | "chi" | "kan"; tiles: Tile[] }>,
): boolean {
  const sequenceMap = countPatternSequencesBySuitAndStart(pattern);
  mergeOpenChiSequences(sequenceMap, calledMelds);

  for (const suit of ["m", "p", "s"] as const) {
    for (let start = 1; start <= 4; start += 1) {
      const a = sequenceMap.get(`${suit}${start}`) ?? 0;
      const b = sequenceMap.get(`${suit}${start + 3}`) ?? 0;
      if (a > 0 && b > 0) {
        return true;
      }
    }
  }

  return false;
}

function hasTozainanpei(calledMelds: Array<{ type: "pon" | "chi" | "kan"; tiles: Tile[] }>): boolean {
  const required = new Set<Tile>(["z1", "z2", "z3", "z4"]);
  const achieved = new Set<Tile>();
  for (const meld of calledMelds) {
    if (meld.type !== "kan" || meld.tiles.length !== 4) continue;
    const tile = meld.tiles[0];
    if (required.has(tile)) {
      achieved.add(tile);
    }
  }
  return achieved.size === 4;
}

function isFujunzen(
  pattern: HandPattern,
  calledMelds: Array<{ type: "pon" | "chi" | "kan"; tiles: Tile[] }>,
): boolean {
  const pairTile = toTile(pattern.pairIndex);
  if (!YAOCHU_SET.has(pairTile)) return false;

  let hasHonor = pairTile[0] === "z";

  for (const meld of pattern.melds) {
    if (meld.kind === "sequence") {
      const startRank = (meld.index % 9) + 1;
      if (!(startRank === 1 || startRank === 7)) return false;
    } else {
      if (!isTerminalOrHonorIndex(meld.index)) return false;
      if (meld.index >= 27) hasHonor = true;
    }
  }

  for (const meld of calledMelds) {
    if (!meldIsTerminalOrHonorRelated(meld)) return false;
    if (meld.tiles.some((tile) => tile[0] === "z")) {
      hasHonor = true;
    }
  }

  return hasHonor;
}

function calculateFu(pattern: HandPattern, context: HandContext): number {
  let fu = 20;

  if (context.byTsumo) {
    fu += 2;
  } else if (context.isMenzen) {
    fu += 10;
  }

  for (const meld of pattern.melds) {
    if (meld.kind !== "triplet") continue;

    const isYaochu = isTerminalOrHonorIndex(meld.index);
    if (context.isMenzen) {
      fu += isYaochu ? 8 : 4;
    } else {
      fu += isYaochu ? 4 : 2;
    }
  }

  const pairTile = toTile(pattern.pairIndex);
  const pairWind =
    (context.seatWind === "east" && pairTile === "z1") ||
    (context.roundWind === "east" && pairTile === "z1");
  const pairDragon = pairTile === "z5" || pairTile === "z6" || pairTile === "z7";
  if (pairWind || pairDragon) {
    fu += 2;
  }

  return Math.max(20, Math.ceil(fu / 10) * 10);
}

function calculateHandResult(tiles: Tile[], context: HandContext): HandResult {
  const yaku: string[] = [];
  let han = 0;
  const calledMelds = context.calledMelds ?? [];
  const allTiles = [...tiles, ...calledMelds.flatMap((m) => m.tiles)];

  if (context.isReach) {
    yaku.push("リーチ");
    han += 1;
  }

  if (context.isIppatsu) {
    yaku.push("一発");
    han += 1;
  }

  if (context.byTsumo && context.isMenzen) {
    yaku.push("門前ツモ");
    han += 1;
  }

  if (isTanyao(allTiles)) {
    yaku.push("タンヤオ");
    han += 1;
  }

  const requiredMeldCount = Math.max(0, 4 - calledMelds.length);
  const pattern = findStandardHandPattern(tiles, requiredMeldCount);
  if (pattern) {
    const dragonTriplet = pattern.melds.some((m) => m.kind === "triplet" && (m.index === 31 || m.index === 32 || m.index === 33));
    if (dragonTriplet) {
      yaku.push("役牌");
      han += 1;
    }

    const allTriplets = pattern.melds.every((m) => m.kind === "triplet");
    if (allTriplets) {
      yaku.push("対々和");
      han += 2;
    }

    if (hasNishokuDojun(pattern, calledMelds)) {
      yaku.push("二色同順");
      han += 1;
    }

    if (context.isMenzen && hasTochumadeTsukan(pattern, calledMelds)) {
      yaku.push("途中まで通貫");
      han += 1;
    }

    if (isFujunzen(pattern, calledMelds)) {
      yaku.push("不純全");
      han += context.isMenzen ? 2 : 1;
    }
  }

  if (hasTozainanpei(calledMelds)) {
    yaku.push("東西南北");
    han += 1;
  }

  const doraCount = countDora(allTiles, context.doraIndicator);
  if (doraCount > 0) {
    yaku.push(`ドラ${doraCount}`);
    han += doraCount;
  }

  const doraNeighborCount = countDoraNeighbor(allTiles, context.doraIndicator);
  if (doraNeighborCount > 0) {
    yaku.push(`ドラ隣${doraNeighborCount}`);
    han += doraNeighborCount * 0.5;
  }

  if ((context.reachCount ?? 0) > 1) {
    yaku.push(`無限立直x${(context.reachCount ?? 1) - 1}`);
  }

  if (han <= 0) {
    yaku.push("役なし");
    han = 1;
  }

  const fu = pattern ? calculateFu(pattern, context) : 30;
  const basePoints = fu * 2 ** (han + 2);

  return { han, fu, yaku, basePoints };
}

function roundUp100(value: number): number {
  return Math.ceil(value / 100) * 100;
}

export function calculateScoreResult(params: {
  winner: PlayerWind;
  loser?: PlayerWind;
  byTsumo: boolean;
  winningTiles: Tile[];
  context: Omit<HandContext, "byTsumo">;
}): ScoreResult {
  const { winner, loser, byTsumo, winningTiles, context } = params;
  const hand = calculateHandResult(winningTiles, { ...context, byTsumo });
  const dealer = winner === "east";

  const deltas: Record<PlayerWind, number> = { east: 0, south: 0, west: 0 };

  if (byTsumo) {
    if (dealer) {
      const payEach = roundUp100(hand.basePoints * 3);
      for (const wind of ["south", "west"] as const) {
        deltas[wind] -= payEach;
        deltas[winner] += payEach;
      }
      return {
        han: hand.han,
        fu: hand.fu,
        yaku: hand.yaku,
        pointLabel: `${hand.han}翻${hand.fu}符 ツモ ${payEach} all`,
        deltas,
      };
    }

    const total = roundUp100(hand.basePoints * 4);
    const payEach = roundUp100(total / 2);
    for (const wind of ["east", "south", "west"] as const) {
      if (wind !== winner) {
        deltas[wind] -= payEach;
        deltas[winner] += payEach;
      }
    }

    return {
      han: hand.han,
      fu: hand.fu,
      yaku: hand.yaku,
      pointLabel: `${hand.han}翻${hand.fu}符 ツモ ${payEach}/${payEach}`,
      deltas,
    };
  }

  const ronPoints = roundUp100(hand.basePoints * (dealer ? 6 : 4));
  if (loser) {
    deltas[loser] -= ronPoints;
    deltas[winner] += ronPoints;
  }

  return {
    han: hand.han,
    fu: hand.fu,
    yaku: hand.yaku,
    pointLabel: `${hand.han}翻${hand.fu}符 ロン ${ronPoints}`,
    deltas,
  };
}

export function evaluateHandYaku(hand: Tile[], winningTile: Tile, context: HandContext): HandResult {
  return calculateHandResult([...hand, winningTile], context);
}

export function evaluateHandTiles(tiles: Tile[], context: HandContext): HandResult {
  return calculateHandResult(tiles, context);
}

