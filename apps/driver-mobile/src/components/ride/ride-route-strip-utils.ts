/** Splits a stored address into the short place name and the fuller line shown under it. */
export function splitPlaceLabel(label: string): { name: string; detail: string } {
  const trimmed = label.trim();
  if (!trimmed) return { name: '', detail: '' };
  const name = trimmed.split(',')[0]!.trim() || trimmed;
  return { name, detail: trimmed };
}
