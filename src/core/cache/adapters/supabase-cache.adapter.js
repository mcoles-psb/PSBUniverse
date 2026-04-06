import { supabase } from "@/infrastructure/supabase/client";
import { getOrFetchCached } from "@/core/cache/adapters/browser-cache.adapter";

function applyFilter(query, filter) {
  if (!filter?.column || !filter?.op) return query;

  const { column, op, value } = filter;

  switch (op) {
    case "eq":
      return query.eq(column, value);
    case "neq":
      return query.neq(column, value);
    case "gt":
      return query.gt(column, value);
    case "gte":
      return query.gte(column, value);
    case "lt":
      return query.lt(column, value);
    case "lte":
      return query.lte(column, value);
    case "in":
      return query.in(column, Array.isArray(value) ? value : []);
    case "like":
      return query.like(column, value);
    case "ilike":
      return query.ilike(column, value);
    case "is":
      return query.is(column, value);
    default:
      return query;
  }
}

export async function runSupabaseSelect(config) {
  const {
    supabaseClient = supabase,
    table,
    select = "*",
    filters = [],
    orderBy,
    ascending = true,
    limit,
    single = false,
  } = config || {};

  if (!table) {
    throw new Error("table is required for runSupabaseSelect");
  }

  let query = supabaseClient.from(table).select(select);

  filters.forEach((filter) => {
    query = applyFilter(query, filter);
  });

  if (orderBy) {
    query = query.order(orderBy, { ascending });
  }

  if (Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit);
  }

  if (single) {
    query = query.single();
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

export async function getSupabaseSelectWithCache(config) {
  const {
    cacheKey,
    namespace,
    ttlMs,
    version,
    lastUpdated,
    allowStaleOnError,
    forceFresh,
    query,
  } = config || {};

  if (!cacheKey) {
    throw new Error("cacheKey is required for getSupabaseSelectWithCache");
  }

  if (!query?.table) {
    throw new Error("query.table is required for getSupabaseSelectWithCache");
  }

  return getOrFetchCached({
    key: cacheKey,
    namespace,
    ttlMs,
    version,
    lastUpdated,
    allowStaleOnError,
    forceFresh,
    fetcher: () => runSupabaseSelect(query),
  });
}
