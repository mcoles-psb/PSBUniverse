# Client Cache Layer (Reusable Across Apps)

The project includes a reusable browser cache utility for all current and future app modules.

- Location: `src/core/cache/`
- Storage: `localStorage` (with in-memory fallback when unavailable)
- Default TTL: 8 hours
- Entry fields: `key`, `data`, `created_at`, `created_at_ms`, `expires_at_ms`, optional `version`, optional `last_updated`

## Core APIs

- `createCacheKey(...parts)`
- `getOrFetchCached({ key, fetcher, ttlMs, namespace, forceFresh, allowStaleOnError })`
- `invalidateCacheKey(key, { namespace })`
- `invalidateCacheKeys(keys, { namespace })`
- `invalidateCacheByPrefix(prefix, { namespace })`
- `mutateWithCache({ mutationFn, invalidate, refetch })`
- `createSupabaseRealtimeInvalidator({ supabase, watches, resolveKeys })`

## Supabase Helper APIs

- `runSupabaseSelect({ table, select, filters, orderBy, single })`
- `getSupabaseSelectWithCache({ cacheKey, query, namespace, forceFresh })`

## Usage Pattern

1. Build a dynamic key with `createCacheKey`, for example `setup:statuses` or `projects:list`.
2. Read through `getOrFetchCached` or `getSupabaseSelectWithCache`.
3. After create/update/delete, invalidate affected keys.
4. Refetch with `forceFresh: true` before updating UI state.

## Consistency Rules

- Cache is a performance layer only, not source of truth.
- Fresh server data always replaces cache values.
- If fresh fetch fails, stale cache can be returned as fallback when enabled.
- For frequently changing transactional data, use shorter TTLs and explicit invalidation.

## Optional Realtime Invalidation

Use `createSupabaseRealtimeInvalidator` to watch table events and invalidate keys automatically.
This is optional and can be enabled per module.
