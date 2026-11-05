export function listingParams(url, filters) {
  const query = new URL(url).searchParams;
  if ([...query.keys()].some(k => !['filter','page'].includes(k)) || query.getAll('filter').length > 1 || query.getAll('page').length > 1) return null;
  const filter = query.get('filter') || 'all', page = query.get('page') || '1';
  if (!Object.hasOwn(filters,filter) || !/^[1-9]\d{0,4}$/.test(page)) return null;
  return {filter, page:Number(page), limit:10, offset:(Number(page)-1)*10};
}
