let counter = 0;

/** Short unique id. Ids only need to be unique within one project document. */
export function uid(prefix = "x"): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
