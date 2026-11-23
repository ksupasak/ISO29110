import { Icon } from "@/components/icon";

/** Round icon-only button for row actions; the label is the accessible name and the tooltip. */
export function IconButton({
  icon,
  label,
  tone = "default",
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={tone === "danger" ? "btn btn-icon btn-icon-danger" : "btn btn-icon"}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
