import Link from "next/link";
import { AppCard } from "@/components/app-card";

export type ReferenceGroup = { label: string; items: { code: string; text: string; href: string }[] };

/** Card listing what an item is linked to, grouped by kind; every code links to its detail page. */
export function ReferencePanel({
  title,
  groups,
  actions,
}: {
  title: string;
  groups: ReferenceGroup[];
  actions?: React.ReactNode;
}) {
  return (
    <AppCard title={title} icon="link" actions={actions}>
      <div className="card-body d-grid gap-3">
        {groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h3 className="h6 text-body-secondary mb-1">{g.label}</h3>
            {g.items.length === 0 ? (
              <p className="small text-body-secondary mb-0">ไม่มี</p>
            ) : (
              <ul className="list-unstyled mb-0 d-grid gap-1">
                {g.items.map((i, idx) => (
                  <li key={`${i.code}-${idx}`}>
                    <Link href={i.href} className="fw-medium me-2">{i.code}</Link>
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </AppCard>
  );
}
