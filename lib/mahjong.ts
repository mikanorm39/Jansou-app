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
  isDoubleReach?: boolean;
  isRinshan?: boolean;
  isChankan?: boolean;
  isHaitei?: boolean;
  isHoutei?: boolean;
  isTenho?: boolean;
  isChiho?: boolean;
  kanCount?: number;
  doraIndicator: Tile;
  isMenzen: boolean;
  byTsumo: boolean;
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

function isTerminalIndex(index: number): boolean {
  if (index >= 27) return false;
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

function collectMeldPatterns(counts: number[], out: MeldPattern[][], acc: MeldPattern[] = [], limit = 128) {
  if (out.length >= limit) return;
  const i = counts.findIndex((v) => v > 0);
  if (i === -1) {
    out.push([...acc]);
    return;
  }

  if (counts[i] >= 3) {
    counts[i] -= 3;
    acc.push({ kind: "triplet", index: i });
    collectMeldPatterns(counts, out, acc, limit);
    acc.pop();
    counts[i] += 3;
  }

  if (isSuitIndex(i)) {
    const pos = i % 9;
    if (pos <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
      counts[i] -= 1;
      counts[i + 1] -= 1;
      counts[i + 2] -= 1;
      acc.push({ kind: "sequence", index: i });
      collectMeldPatterns(counts, out, acc, limit);
      acc.pop();
      counts[i] += 1;
      counts[i + 1] += 1;
      counts[i + 2] += 1;
    }
  }
}

function meldSignature(melds: MeldPattern[]): string {
  return melds
    .map((m) => `${m.kind === "sequence" ? "s" : "t"}${m.index}`)
    .sort()
    .join(",");
}

function findStandardHandPattern(tiles: Tile[]): HandPattern | null {
  if (tiles.length % 3 !== 2) return null;

  const counts = toCounts(tiles);
  for (let i = 0; i < 34; i += 1) {
    if (counts[i] < 2) continue;

    counts[i] -= 2;
    const melds = findMeldPatterns(counts);
    counts[i] += 2;

    if (melds && melds.length === 4) {
      return { pairIndex: i, melds };
    }
  }

  return null;
}

function findStandardHandPatterns(tiles: Tile[]): HandPattern[] {
  if (tiles.length % 3 !== 2) return [];

  const counts = toCounts(tiles);
  const found: HandPattern[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < 34; i += 1) {
    if (counts[i] < 2) continue;
    counts[i] -= 2;
    const allMelds: MeldPattern[][] = [];
    collectMeldPatterns(counts, allMelds);
    counts[i] += 2;

    for (const melds of allMelds) {
      if (melds.length !== 4) continue;
      const signature = `${i}|${meldSignature(melds)}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      found.push({ pairIndex: i, melds });
    }
  }

  return found;
}

function isChiitoitsu(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;
  const counts = toCounts(tiles);
  const pairs = counts.filter((c) => c === 2).length;
  const invalid = counts.some((c) => c === 1 || c === 3 || c === 4);
  return pairs === 7 && !invalid;
}

function isKokushiMusou(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;
  const counts = toCounts(tiles);
  const yaochuIndices = [
    0, 8, 9, 17, 18, 26,
    27, 28, 29, 30, 31, 32, 33,
  ];
  let pairFound = false;
  for (const i of yaochuIndices) {
    if (counts[i] === 0) return false;
    if (counts[i] >= 2) pairFound = true;
  }
  for (let i = 0; i < 34; i += 1) {
    if (!yaochuIndices.includes(i) && counts[i] > 0) return false;
  }
  return pairFound;
}

export function isWinningHand(tiles: Tile[]): boolean {
  return findStandardHandPattern(tiles) !== null || isChiitoitsu(tiles) || isKokushiMusou(tiles);
}

function canWinByOneDraw(thirteenTiles: Tile[]): boolean {
  for (const draw of TILE_TYPES) {
    if (isWinningHand([...thirteenTiles, draw])) {
      return true;
    }
  }
  return false;
}

export function calculateShanten(hand: Tile[]): number | null {
  if (hand.length < 13) return null;

  if (hand.length % 3 === 2) {
    if (isWinningHand(hand)) return -1;

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

function isTanyao(tiles: Tile[]): boolean {
  return tiles.every((tile) => !YAOCHU_SET.has(tile));
}

function windIndexOf(wind: PlayerWind | undefined): number | null {
  if (wind === "east") return 27;
  if (wind === "south") return 28;
  if (wind === "west") return 29;
  return null;
}

function sequenceStartRanksBySuit(pattern: HandPattern): Record<"m" | "p" | "s", number[]> {
  const starts: Record<"m" | "p" | "s", number[]> = { m: [], p: [], s: [] };
  for (const meld of pattern.melds) {
    if (meld.kind !== "sequence") continue;
    if (meld.index < 9) starts.m.push((meld.index % 9) + 1);
    else if (meld.index < 18) starts.p.push((meld.index % 9) + 1);
    else if (meld.index < 27) starts.s.push((meld.index % 9) + 1);
  }
  return starts;
}

function tripletIndices(pattern: HandPattern): number[] {
  return pattern.melds.filter((m) => m.kind === "triplet").map((m) => m.index);
}

function isPinfuPattern(pattern: HandPattern, context: HandContext): boolean {
  if (!context.isMenzen) return false;
  if (!pattern.melds.every((m) => m.kind === "sequence")) return false;
  const seatWindIndex = windIndexOf(context.seatWind);
  const roundWindIndex = windIndexOf(context.roundWind);
  const pairIsDragon = pattern.pairIndex >= 31 && pattern.pairIndex <= 33;
  const pairIsWind = pattern.pairIndex === seatWindIndex || pattern.pairIndex === roundWindIndex;
  return !pairIsDragon && !pairIsWind;
}

function countIipeiko(pattern: HandPattern): number {
  const starts = sequenceStartRanksBySuit(pattern);
  let pairs = 0;
  for (const suit of ["m", "p", "s"] as const) {
    const map = new Map<number, number>();
    for (const start of starts[suit]) {
      map.set(start, (map.get(start) ?? 0) + 1);
    }
    for (const count of map.values()) {
      pairs += Math.floor(count / 2);
    }
  }
  return pairs;
}

function hasIttsuu(pattern: HandPattern): boolean {
  const starts = sequenceStartRanksBySuit(pattern);
  for (const suit of ["m", "p", "s"] as const) {
    const set = new Set(starts[suit]);
    if (set.has(1) && set.has(4) && set.has(7)) return true;
  }
  return false;
}

function hasSanshokuDoujun(pattern: HandPattern): boolean {
  const starts = sequenceStartRanksBySuit(pattern);
  for (let rank = 1; rank <= 7; rank += 1) {
    if (starts.m.includes(rank) && starts.p.includes(rank) && starts.s.includes(rank)) {
      return true;
    }
  }
  return false;
}

function hasSanshokuDoukou(pattern: HandPattern): boolean {
  const t = tripletIndices(pattern);
  for (let rank = 1; rank <= 9; rank += 1) {
    if (t.includes(rank - 1) && t.includes(9 + rank - 1) && t.includes(18 + rank - 1)) {
      return true;
    }
  }
  return false;
}

function isChanta(pattern: HandPattern): boolean {
  const pairOk = isTerminalOrHonorIndex(pattern.pairIndex);
  if (!pairOk) return false;
  return pattern.melds.every((meld) => {
    if (meld.kind === "triplet") return isTerminalOrHonorIndex(meld.index);
    const startRank = (meld.index % 9) + 1;
    return startRank === 1 || startRank === 7;
  });
}

function isJunchan(pattern: HandPattern): boolean {
  const pairOk = isTerminalIndex(pattern.pairIndex);
  if (!pairOk) return false;
  return pattern.melds.every((meld) => {
    if (meld.kind === "triplet") return isTerminalIndex(meld.index);
    const startRank = (meld.index % 9) + 1;
    return startRank === 1 || startRank === 7;
  });
}

function isHonitsu(tiles: Tile[]): boolean {
  const suits = new Set<string>();
  let hasHonor = false;
  for (const tile of tiles) {
    if (tile[0] === "z") hasHonor = true;
    else suits.add(tile[0]);
  }
  return suits.size === 1 && hasHonor;
}

function isChinitsu(tiles: Tile[]): boolean {
  const suits = new Set<string>();
  for (const tile of tiles) {
    if (tile[0] === "z") return false;
    suits.add(tile[0]);
  }
  return suits.size === 1;
}

function isHonroto(tiles: Tile[]): boolean {
  return tiles.every((tile) => YAOCHU_SET.has(tile));
}

function countDragonTriplets(pattern: HandPattern): number {
  return pattern.melds.filter((m) => m.kind === "triplet" && m.index >= 31 && m.index <= 33).length;
}

function hasShosangen(pattern: HandPattern): boolean {
  const dragonTriplets = countDragonTriplets(pattern);
  const dragonPair = pattern.pairIndex >= 31 && pattern.pairIndex <= 33;
  return dragonTriplets === 2 && dragonPair;
}

function isTsuiso(tiles: Tile[]): boolean {
  return tiles.every((tile) => tile[0] === "z");
}

function isRyuiso(tiles: Tile[]): boolean {
  const green = new Set<Tile>(["s2", "s3", "s4", "s6", "s8", "z6"]);
  return tiles.every((tile) => green.has(tile));
}

function isChinroto(tiles: Tile[]): boolean {
  return tiles.every((tile) => tile[0] !== "z" && (tile[1] === "1" || tile[1] === "9"));
}

function isChuurenPoutou(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;
  if (tiles.some((tile) => tile[0] === "z")) return false;
  const suit = tiles[0][0];
  if (tiles.some((tile) => tile[0] !== suit)) return false;
  const counts = Array.from({ length: 10 }, () => 0);
  for (const tile of tiles) {
    counts[Number(tile[1])] += 1;
  }
  if (counts[1] < 3 || counts[9] < 3) return false;
  for (let i = 2; i <= 8; i += 1) {
    if (counts[i] < 1) return false;
  }
  return true;
}

function windTripletCount(pattern: HandPattern): number {
  return pattern.melds.filter((m) => m.kind === "triplet" && m.index >= 27 && m.index <= 30).length;
}

function hasShosushi(pattern: HandPattern): boolean {
  return windTripletCount(pattern) === 3 && pattern.pairIndex >= 27 && pattern.pairIndex <= 30;
}

function hasDaisushi(pattern: HandPattern): boolean {
  return windTripletCount(pattern) === 4;
}

function calculateFu(pattern: HandPattern | null, context: HandContext, options?: { isPinfu?: boolean; isChiitoitsu?: boolean }): number {
  if (options?.isChiitoitsu) return 25;
  if (!pattern) return 30;
  if (options?.isPinfu) {
    return context.byTsumo ? 20 : 30;
  }

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

  const seatWindIndex = windIndexOf(context.seatWind);
  const roundWindIndex = windIndexOf(context.roundWind);
  const pairWind = pattern.pairIndex === seatWindIndex || pattern.pairIndex === roundWindIndex;
  const pairDragon = pattern.pairIndex >= 31 && pattern.pairIndex <= 33;
  if (pairWind || pairDragon) {
    fu += 2;
  }

  return Math.max(20, Math.ceil(fu / 10) * 10);
}

function calculateHandResult(tiles: Tile[], context: HandContext): HandResult {
  const patterns = findStandardHandPatterns(tiles);
  const hasStandard = patterns.length > 0;
  const chiitoitsu = isChiitoitsu(tiles);
  const kokushi = isKokushiMusou(tiles);

  if (!hasStandard && !chiitoitsu && !kokushi) {
    return { han: 0, fu: 20, yaku: ["役なし"], basePoints: 0 };
  }

  const yakuman: string[] = [];
  if (context.isTenho) yakuman.push("天和");
  if (context.isChiho) yakuman.push("地和");
  if (kokushi) yakuman.push("国士無双");
  if (isTsuiso(tiles)) yakuman.push("字一色");
  if (isRyuiso(tiles)) yakuman.push("緑一色");
  if (isChinroto(tiles)) yakuman.push("清老頭");
  if (isChuurenPoutou(tiles)) yakuman.push("九蓮宝燈");
  if ((context.kanCount ?? 0) >= 4) yakuman.push("四槓子");

  if (hasStandard) {
    if (patterns.some((p) => countDragonTriplets(p) === 3)) yakuman.push("大三元");
    if (patterns.some((p) => hasShosushi(p))) yakuman.push("小四喜");
    if (patterns.some((p) => hasDaisushi(p))) yakuman.push("大四喜");
    if (context.isMenzen && patterns.some((p) => p.melds.every((m) => m.kind === "triplet"))) yakuman.push("四暗刻");
  }

  if (yakuman.length > 0) {
    const uniqueYakuman = [...new Set(yakuman)];
    const han = uniqueYakuman.length * 13;
    const basePoints = 8000 * uniqueYakuman.length;
    return { han, fu: 0, yaku: uniqueYakuman, basePoints };
  }

  type Candidate = { han: number; fu: number; yaku: string[] };
  const candidates: Candidate[] = [];

  function baseYaku(): Candidate {
    const yaku: string[] = [];
    let han = 0;

    if (context.isDoubleReach) {
      yaku.push("ダブルリーチ");
      han += 2;
    } else if (context.isReach) {
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
    if (context.isChankan) {
      yaku.push("槍槓");
      han += 1;
    }
    if (context.isRinshan) {
      yaku.push("嶺上開花");
      han += 1;
    }
    if (context.isHaitei) {
      yaku.push("海底摸月");
      han += 1;
    }
    if (context.isHoutei) {
      yaku.push("河底撈魚");
      han += 1;
    }
    if (isTanyao(tiles)) {
      yaku.push("タンヤオ");
      han += 1;
    }
    if (isHonitsu(tiles)) {
      yaku.push("混一色");
      han += context.isMenzen ? 3 : 2;
    }
    if (isChinitsu(tiles)) {
      yaku.push("清一色");
      han += context.isMenzen ? 6 : 5;
    }
    if (isHonroto(tiles)) {
      yaku.push("混老頭");
      han += 2;
    }
    return { han, fu: 30, yaku };
  }

  if (chiitoitsu) {
    const c = baseYaku();
    c.yaku.push("七対子");
    c.han += 2;
    c.fu = 25;
    candidates.push(c);
  }

  for (const pattern of patterns) {
    const c = baseYaku();
    const iipeikoPairs = countIipeiko(pattern);
    const pinfu = isPinfuPattern(pattern, context);
    const dragonTriplets = countDragonTriplets(pattern);
    const allTriplets = pattern.melds.every((m) => m.kind === "triplet");
    const tripletCount = pattern.melds.filter((m) => m.kind === "triplet").length;

    if (pinfu) {
      c.yaku.push("平和");
      c.han += 1;
    }

    if (context.isMenzen) {
      if (iipeikoPairs >= 2) {
        c.yaku.push("二盃口");
        c.han += 3;
      } else if (iipeikoPairs >= 1) {
        c.yaku.push("一盃口");
        c.han += 1;
      }
    }

    if (dragonTriplets > 0) {
      c.yaku.push("役牌");
      c.han += 1;
    }

    if (allTriplets) {
      c.yaku.push("対々和");
      c.han += 2;
    }

    if (hasIttsuu(pattern)) {
      c.yaku.push("一気通貫");
      c.han += context.isMenzen ? 2 : 1;
    }

    if (hasSanshokuDoujun(pattern)) {
      c.yaku.push("三色同順");
      c.han += context.isMenzen ? 2 : 1;
    }

    if (hasSanshokuDoukou(pattern)) {
      c.yaku.push("三色同刻");
      c.han += 2;
    }

    if (tripletCount >= 3 && context.isMenzen) {
      c.yaku.push("三暗刻");
      c.han += 2;
    }

    if (isChanta(pattern)) {
      c.yaku.push("混全帯么九");
      c.han += context.isMenzen ? 2 : 1;
    }

    if (isJunchan(pattern)) {
      c.yaku.push("純全帯么九");
      c.han += context.isMenzen ? 3 : 2;
    }

    if (hasShosangen(pattern)) {
      c.yaku.push("小三元");
      c.han += 2;
    }

    if ((context.kanCount ?? 0) >= 3) {
      c.yaku.push("三槓子");
      c.han += 2;
    }

    c.fu = calculateFu(pattern, context, { isPinfu: pinfu });
    candidates.push(c);
  }

  let best: Candidate | null = null;
  for (const candidate of candidates) {
    const doraCount = countDora(tiles, context.doraIndicator);
    const withDora: Candidate = {
      han: candidate.han,
      fu: candidate.fu,
      yaku: [...candidate.yaku],
    };
    if (doraCount > 0) {
      withDora.han += doraCount;
      withDora.yaku.push(`ドラ${doraCount}`);
    }
    if (withDora.han <= 0) {
      withDora.han = 1;
      withDora.yaku.push("役なし");
    }

    if (!best) {
      best = withDora;
      continue;
    }
    const bestValue = best.fu * 2 ** (best.han + 2);
    const nextValue = withDora.fu * 2 ** (withDora.han + 2);
    if (nextValue > bestValue || (nextValue === bestValue && withDora.han > best.han)) {
      best = withDora;
    }
  }

  const result = best ?? { han: 1, fu: 30, yaku: ["役なし"] };
  const basePoints = result.fu * 2 ** (result.han + 2);
  return { han: result.han, fu: result.fu, yaku: [...new Set(result.yaku)], basePoints };
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

