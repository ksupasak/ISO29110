/** Material Symbols Outlined glyph, decorative (hidden from assistive tech; label the control instead). */
export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={className ? `material-symbols-outlined ${className}` : "material-symbols-outlined"} aria-hidden="true">
      {name}
    </span>
  );
}
