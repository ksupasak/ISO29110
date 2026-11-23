"use client";

import { useId, useState } from "react";
import Accordion from "react-bootstrap/Accordion";
import Collapse from "react-bootstrap/Collapse";
import { Icon } from "@/components/icon";

/** The nine phases as an accordion, all open to start with. */
export function PhaseAccordion({ phaseKeys, children }: { phaseKeys: string[]; children: React.ReactNode }) {
  return (
    <Accordion alwaysOpen defaultActiveKey={phaseKeys} className="accordion-phases">
      {children}
    </Accordion>
  );
}

export function PhaseItem({
  eventKey,
  title,
  count,
  children,
}: {
  eventKey: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Accordion.Item eventKey={eventKey}>
      <Accordion.Header>
        <span data-testid="phase-heading" className="phase-title">{title}</span>
        <span className="badge-status badge-status-primary ms-2 me-3">{`${count} WP`}</span>
      </Accordion.Header>
      <Accordion.Body className="p-0">{children}</Accordion.Body>
    </Accordion.Item>
  );
}

/**
 * One WP document row: title, badges and actions up front, version history and attachments in a collapsible panel.
 * `toggleLabel` is null when there is nothing to expand.
 */
export function WpRow({
  title,
  meta,
  actions,
  toggleLabel,
  children,
}: {
  title: string;
  meta: React.ReactNode;
  actions: React.ReactNode;
  toggleLabel: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div data-testid="wp-row" className="wp-row">
      <div className="wp-row-head">
        <div className="wp-row-info">
          <div className="wp-row-title text-truncate" title={title}>{title}</div>
          <div className="wp-row-meta">
            {meta}
            {toggleLabel && (
              <button
                type="button"
                className="wp-row-toggle"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((o) => !o)}
              >
                <Icon name={open ? "expand_less" : "expand_more"} />
                {toggleLabel}
              </button>
            )}
          </div>
        </div>
        <div className="wp-row-actions">{actions}</div>
      </div>
      {toggleLabel && (
        <Collapse in={open}>
          <div id={panelId}>
            <div className="wp-row-detail">{children}</div>
          </div>
        </Collapse>
      )}
    </div>
  );
}
