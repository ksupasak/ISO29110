import { Icon } from "@/components/icon";

/**
 * Material card; with a title it gets a header, either plain white or a primary band with an icon chip.
 * Children render directly in the card: wrap content in `.card-body`, or place a `.table` flush.
 */
export function AppCard({
  title,
  icon,
  headerVariant = "plain",
  actions,
  children,
}: {
  title?: string;
  icon?: string;
  headerVariant?: "primary" | "plain";
  /** Controls aligned to the right of the header (needs `title`). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      {title && (
        <div className={headerVariant === "primary" ? "card-header card-header-primary" : "card-header"}>
          {icon && (
            <span className="card-header-icon">
              <Icon name={icon} />
            </span>
          )}
          <h2 className="card-title">{title}</h2>
          {actions && <div className="ms-auto d-flex align-items-center gap-1">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
