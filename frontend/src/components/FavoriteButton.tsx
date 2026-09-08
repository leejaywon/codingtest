export function FavoriteStarIcon() {
  return (
    <svg className="favorite-star-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2.4 2.86 5.8 6.4.93-4.63 4.51 1.1 6.38L12 17.01l-5.73 3.01 1.1-6.38-4.63-4.51 6.4-.93L12 2.4Z" />
      <path className="favorite-star-shine" d="m12 5.45 1.63 3.3-4.32 6.12.68-3.94-2.87-2.8 3.97-.58L12 5.45Z" />
    </svg>
  );
}

export default function FavoriteButton({
  favorite,
  label,
  pending,
  onToggle,
  dataFavoriteId,
}: {
  favorite: boolean;
  label: string;
  pending: boolean;
  onToggle: () => void;
  dataFavoriteId?: string;
}) {
  const action = favorite ? "즐겨찾기에서 삭제" : "즐겨찾기에 추가";
  return (
    <button
      type="button"
      data-favorite-id={dataFavoriteId}
      className={`problem-favorite-btn${favorite ? " on" : ""}`}
      aria-label={`${label} ${action}`}
      aria-pressed={favorite}
      title={action}
      disabled={pending}
      onClick={onToggle}
    >
      <FavoriteStarIcon />
    </button>
  );
}
