"use client";

type StarsProps = {
  rating: number;
  outOf?: number;
  size?: number;
};

export default function Stars({ rating, outOf = 5, size = 16 }: StarsProps) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = outOf - full - (half ? 1 : 0);

  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f${i}`} style={{ fontSize: size }}>★</span>
      ))}
      {half && <span style={{ fontSize: size }}>☆</span>}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} style={{ fontSize: size }}>☆</span>
      ))}
    </div>
  );
}
