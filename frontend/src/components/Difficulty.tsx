const BOJ_TIERS = ["브론즈", "실버", "골드", "플래티넘", "다이아몬드", "루비"];

export default function Difficulty({ source, label }: { source: string; label: string }) {
  const text = label.trim() || "–";
  const match = source === "boj"
    ? text.match(/^(브론즈|실버|골드|플래티넘|다이아몬드|루비)\s*([1-5])$/)
    : null;
  // solved.ac numbers Bronze V through Ruby I from 1 through 30.
  const tier = match ? BOJ_TIERS.indexOf(match[1]) * 5 + 6 - Number(match[2]) : null;

  return (
    <span className="difficulty" data-leetcode-difficulty={source === "leetcode" ? text.toLowerCase() : undefined}>
      {tier !== null ? (
        <img
          key={tier}
          className="difficulty-icon"
          src={`https://static.solved.ac/tier_small/${tier}.svg`}
          alt=""
          aria-hidden="true"
          width={14}
          height={18}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.hidden = true; }}
        />
      ) : null}
      <span>{text}</span>
    </span>
  );
}
