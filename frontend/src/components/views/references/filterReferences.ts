import type { Reference } from '@apptypes/reference';

export function referenceHaystack(reference: Reference): string {
  const creators = (reference.creators || [])
    .map((creator) => `${creator.firstName || ''} ${creator.lastName || ''}`)
    .join(' ');
  return [
    reference.title,
    reference.doi,
    reference.publication,
    reference.abstract,
    creators,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
}

export function filterReferences(
  references: Reference[],
  query: string,
  type: string,
): Reference[] {
  const needle = query.trim().toLowerCase();
  return references.filter((reference) => {
    if (type !== 'all' && reference.type !== type) return false;
    if (!needle) return true;
    return referenceHaystack(reference).includes(needle);
  });
}
