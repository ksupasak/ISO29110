"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { breadcrumbs } from "./nav-model";

export function Breadcrumbs() {
  const crumbs = breadcrumbs(usePathname());
  return (
    <nav aria-label="breadcrumb" className="app-breadcrumb-nav">
      <ol className="app-breadcrumb">
        {crumbs.map((crumb, i) => (
          <Fragment key={`${i}-${crumb.label}`}>
            {i > 0 && <li className="app-breadcrumb-sep" aria-hidden="true">›</li>}
            <li>
              {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
