export type ManTile =
  | "m1"
  | "m2"
  | "m3"
  | "m4"
  | "m5"
  | "m6"
  | "m7"
  | "m8"
  | "m9";

export type PinTile =
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "p6"
  | "p7"
  | "p8"
  | "p9";

export type SouTile =
  | "s1"
  | "s2"
  | "s3"
  | "s4"
  | "s5"
  | "s6"
  | "s7"
  | "s8"
  | "s9";

export type HonorTile = "z1" | "z2" | "z3" | "z4" | "z5" | "z6" | "z7";

export type Tile = ManTile | PinTile | SouTile | HonorTile;

export type PlayerWind = "east" | "south" | "west";

export type PlayerState = {
  wind: PlayerWind;
  hand: Tile[];
  discards: Tile[];
  score: number;
  isReach: boolean;
};

export type RoundInfo = {
  kyoku: number;
  honba: number;
  doraIndicator: Tile;
};

export type ThreePlayerGameState = {
  players: PlayerState[];
  wall: Tile[];
  round: RoundInfo;
  turn: PlayerWind;
};
