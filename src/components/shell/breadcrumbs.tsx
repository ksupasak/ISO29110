"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { breadcrumbs } from "./nav-model";

export function Breadcrumbs() {
  const crumbs = breadcrumbs(usePathname());
  // Below sm only the current page is shown, so it never truncates.
  const last = (i: number) => i === crumbs.length - 1;
  return (
    <nav aria-label="breadcrumb" className="app-breadcrumb-nav">
      <ol className="app-breadcrumb">
        {crumbs.map((crumb, i) => (
          <Fragment key={`${i}-${crumb.label}`}>
            {i > 0 && <li className="app-breadcrumb-sep d-none d-sm-inline" aria-hidden="true">›</li>}
            <li className={last(i) ? undefined : "d-none d-sm-inline"}>
              {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
