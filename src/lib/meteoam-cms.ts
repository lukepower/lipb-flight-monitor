/** MeteoAM CMS text fields may arrive as a bare string or `{ value }`. */
export type CmsTextField = string | { value?: string } | null | undefined;

export function cmsFieldText(field: CmsTextField): string | null {
  if (typeof field === "string") {
    const t = field.trim();
    return t.length > 0 ? field : null;
  }
  if (field && typeof field === "object" && typeof field.value === "string") {
    const t = field.value.trim();
    return t.length > 0 ? field.value : null;
  }
  return null;
}
