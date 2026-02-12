import Image from "next/image";
import type { Tile as TileType } from "../../types/mahjong";

type Props = {
  tile: TileType;
  hidden?: boolean;
  className?: string;
};

function cn(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Tile({ tile, hidden = false, className }: Props) {
  if (hidden) {
    return (
      <div
        className={cn("h-14 w-10 rounded-md border border-neutral-700 bg-neutral-700", className)}
        aria-label="hidden tile"
      />
    );
  }

  return (
    <Image
      src={`/tiles/${tile}.png`}
      alt={tile}
      width={40}
      height={56}
      className={cn("h-14 w-10 rounded-md border border-amber-200 bg-white object-contain p-0.5", className)}
      unoptimized
    />
  );
}
