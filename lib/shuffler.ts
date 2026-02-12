import type { Tile, PlayerWind } from "../types/mahjong";

const SUITS: Array<"m" | "p" | "s"> = ["m", "p", "s"];
const HONORS = ["z1", "z2", "z3", "z4", "z5", "z6", "z7"] as const;

const TILE_ORDER: Record<string, number> = {
  m1: 1,
  m2: 2,
  m3: 3,
  m4: 4,
  m5: 5,
  m6: 6,
  m7: 7,
  m8: 8,
  m9: 9,
  p1: 11,
  p2: 12,
  p3: 13,
  p4: 14,
  p5: 15,
  p6: 16,
  p7: 17,
  p8: 18,
  p9: 19,
  s1: 21,
  s2: 22,
  s3: 23,
  s4: 24,
  s5: 25,
  s6: 26,
  s7: 27,
  s8: 28,
  s9: 29,
  z1: 31,
  z2: 32,
  z3: 33,
  z4: 34,
  z5: 35,
  z6: 36,
  z7: 37,
};

export type InitialDeal = {
  players: Record<PlayerWind, Tile[]>;
  wall: Tile[];
};

export function buildThreePlayerDeck(): Tile[] {
  const deck: Tile[] = [];

  for (const suit of SUITS) {
    for (let n = 1; n <= 9; n += 1) {
      const tile = `${suit}${n}` as Tile;
      for (let i = 0; i < 4; i += 1) {
        deck.push(tile);
      }
    }
  }

  for (const honor of HONORS) {
    for (let i = 0; i < 4; i += 1) {
      deck.push(honor);
    }
  }

  return deck;
}

export function fisherYatesShuffle<T>(source: T[]): T[] {
  const array = [...source];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => TILE_ORDER[a] - TILE_ORDER[b]);
}

export function dealInitialHands(shuffledDeck = fisherYatesShuffle(buildThreePlayerDeck())): InitialDeal {
  const HAND_SIZE = 13;
  const WINDS: PlayerWind[] = ["east", "south", "west"];

  const players: Record<PlayerWind, Tile[]> = {
    east: [],
    south: [],
    west: [],
  };

  let cursor = 0;
  for (const wind of WINDS) {
    const hand = shuffledDeck.slice(cursor, cursor + HAND_SIZE);
    players[wind] = sortTiles(hand);
    cursor += HAND_SIZE;
  }

  return {
    players,
    wall: shuffledDeck.slice(cursor),
  };
}
