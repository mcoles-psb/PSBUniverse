# Cache Layer Libraries

Files:

- src/core/cache/adapters/browser-cache.adapter.js
- src/core/cache/adapters/supabase-cache.adapter.js
- src/core/cache/index.js

## Purpose

Provide a reusable browser-side caching framework for any current or future module.

## clientCache.js Capabilities

- Dynamic key generation
- Namespace scoping
- TTL expiration (default 8 hours)
- Version mismatch handling
- Manual invalidation (single, multi-key, prefix, namespace)
- Optional stale-cache fallback on fetch failure
- Optional Supabase realtime invalidation hook

## supabaseCache.js Capabilities

- Generic Supabase select wrapper with configurable table/query options
- Filter operator mapping (eq, neq, gt, gte, lt, lte, in, like, ilike, is)
- Cache-backed query execution with forceFresh support

## Current Namespace

- psb-universe

## Current Key Families

- setup:*
- projects:*
- company:profile
