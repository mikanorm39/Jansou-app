import type { Tile, PlayerWind } from "../types/mahjong";

const SUITS: Array<"m" | "p" | "s"> = ["m", "p", "s"];
const HONORS = ["z1", "z2", "z3", "z4", "z5", "z6", "z7"] as const;

const SUIT_ORDER: Record<"m" | "p" | "s" | "z", number> = {
  m: 0,
  p: 1,
  s: 2,
  z: 3,
};

function tileSortKey(tile: Tile): number {
  const suit = tile[0] as "m" | "p" | "s" | "z";
  const rank = Number(tile.slice(1));
  return SUIT_ORDER[suit] * 10 + rank;
}

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
  return [...tiles].sort((a, b) => tileSortKey(a) - tileSortKey(b));
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
