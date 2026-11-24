/** One tag and what it holds (Thai). */
export type TagSpec = { name: string; meaning: string };
/** A top-level tag; with `inner` it is a loop and `inner` lists the tags that must sit inside it. */
export type TagNode = TagSpec & { inner?: TagSpec[] };

/** A WP whose document the system fills from a tagged template. */
export type GeneratedWp = {
  wpCode: string;
  /** Required tag structure: top-level tags in document order, loops with their inner tags. */
  structure: TagNode[];
  /** Flat list for the admin reference card, derived from `structure`; inner tags carry their loop. */
  tags: (TagSpec & { loop?: string })[];
  /** Realistic data used by the template check. */
  sample: Record<string, unknown>;
  /** Empty values (lists with 3 empty rows) for the hand-fill download. */
  blank: Record<string, unknown>;
};

export function defineGeneratedWp(def: Omit<GeneratedWp, "tags">): GeneratedWp {
  const tags = def.structure.flatMap((node) => [
    { name: node.name, meaning: node.meaning },
    ...(node.inner ?? []).map((t) => ({ ...t, loop: node.name })),
  ]);
  return { ...def, tags };
}
