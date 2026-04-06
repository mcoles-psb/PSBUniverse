const CACHE_PREFIX = "psb-cache";
const DEFAULT_NAMESPACE = "global";
export const DEFAULT_CACHE_TTL_MS = 8 * 60 * 60 * 1000;

const inMemoryStore = new Map();

function isBrowser() {
  return typeof window !== "undefined";
}

function supportsLocalStorage() {
  if (!isBrowser()) return false;
  try {
    const probe = "__cache_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function normalizeNamespace(namespace) {
  return String(namespace || DEFAULT_NAMESPACE).trim() || DEFAULT_NAMESPACE;
}

function normalizeCacheKey(cacheKey) {
  const value = String(cacheKey || "").trim();
  if (!value) {
    throw new Error("cacheKey is required");
  }
  return value;
}

function getStorageKey(cacheKey, namespace = DEFAULT_NAMESPACE) {
  const safeNamespace = normalizeNamespace(namespace);
  const safeKey = normalizeCacheKey(cacheKey);
  return `${CACHE_PREFIX}:${safeNamespace}:${safeKey}`;
}

function readRaw(storageKey) {
  if (supportsLocalStorage()) {
    return window.localStorage.getItem(storageKey);
  }
  return inMemoryStore.get(storageKey) ?? null;
}

function writeRaw(storageKey, value) {
  if (supportsLocalStorage()) {
    window.localStorage.setItem(storageKey, value);
    return;
  }
  inMemoryStore.set(storageKey, value);
}

function removeRaw(storageKey) {
  if (supportsLocalStorage()) {
    window.localStorage.removeItem(storageKey);
    return;
  }
  inMemoryStore.delete(storageKey);
}

function allRawKeys() {
  if (supportsLocalStorage()) {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  }
  return Array.from(inMemoryStore.keys());
}

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isVersionMismatch(entry, version) {
  if (version === undefined || version === null || version === "") return false;
  return String(entry?.version ?? "") !== String(version);
}

function isExpired(entry, now = Date.now()) {
  const expiresAt = Number(entry?.expires_at_ms || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return true;
  return now >= expiresAt;
}

function createEntry({ cacheKey, data, ttlMs, version, lastUpdated }) {
  const now = Date.now();
  const safeTtlMs = Number.isFinite(Number(ttlMs)) ? Math.max(0, Number(ttlMs)) : DEFAULT_CACHE_TTL_MS;
  return {
    key: cacheKey,
    data,
    created_at: new Date(now).toISOString(),
    created_at_ms: now,
    expires_at_ms: now + safeTtlMs,
    ttl_ms: safeTtlMs,
    version: version ?? null,
    last_updated: lastUpdated ?? null,
  };
}

export function createCacheKey(...parts) {
  return parts
    .flat()
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(":");
}

export function getCacheEntry(cacheKey, options = {}) {
  const namespace = normalizeNamespace(options.namespace);
  const storageKey = getStorageKey(cacheKey, namespace);
  const parsed = safeParse(readRaw(storageKey));

  if (!parsed) {
    return {
      storageKey,
      entry: null,
      expired: true,
      versionMismatch: false,
    };
  }

  const versionMismatch = isVersionMismatch(parsed, options.version);
  const expired = isExpired(parsed);

  return {
    storageKey,
    entry: parsed,
    expired,
    versionMismatch,
  };
}

export function setCacheEntry(cacheKey, data, options = {}) {
  const namespace = normalizeNamespace(options.namespace);
  const safeCacheKey = normalizeCacheKey(cacheKey);
  const storageKey = getStorageKey(safeCacheKey, namespace);
  const entry = createEntry({
    cacheKey: safeCacheKey,
    data,
    ttlMs: options.ttlMs,
    version: options.version,
    lastUpdated: options.lastUpdated,
  });
  writeRaw(storageKey, JSON.stringify(entry));
  return entry;
}

export function invalidateCacheKey(cacheKey, options = {}) {
  const namespace = normalizeNamespace(options.namespace);
  const storageKey = getStorageKey(cacheKey, namespace);
  removeRaw(storageKey);
}

export function invalidateCacheKeys(cacheKeys, options = {}) {
  (cacheKeys || []).forEach((cacheKey) => {
    if (cacheKey) invalidateCacheKey(cacheKey, options);
  });
}

export function invalidateCacheByPrefix(prefix, options = {}) {
  const namespace = normalizeNamespace(options.namespace);
  const prefixValue = String(prefix || "").trim();
  if (!prefixValue) return;

  const targetPrefix = `${CACHE_PREFIX}:${namespace}:${prefixValue}`;
  allRawKeys().forEach((storageKey) => {
    if (storageKey.startsWith(targetPrefix)) {
      removeRaw(storageKey);
    }
  });
}

export function clearNamespaceCache(options = {}) {
  const namespace = normalizeNamespace(options.namespace);
  const targetPrefix = `${CACHE_PREFIX}:${namespace}:`;
  allRawKeys().forEach((storageKey) => {
    if (storageKey.startsWith(targetPrefix)) {
      removeRaw(storageKey);
    }
  });
}

export async function getOrFetchCached(config) {
  const {
    key,
    fetcher,
    ttlMs = DEFAULT_CACHE_TTL_MS,
    namespace = DEFAULT_NAMESPACE,
    version,
    lastUpdated,
    allowStaleOnError = true,
    forceFresh = false,
  } = config || {};

  if (typeof fetcher !== "function") {
    throw new Error("fetcher must be a function");
  }

  const cached = getCacheEntry(key, { namespace, version });
  const staleCandidate = cached.entry;

  if (!forceFresh && cached.entry && !cached.expired && !cached.versionMismatch) {
    return {
      data: cached.entry.data,
      source: "cache",
      stale: false,
      entry: cached.entry,
    };
  }

  if (cached.versionMismatch) {
    invalidateCacheKey(key, { namespace });
  }

  try {
    const freshData = await fetcher();
    const entry = setCacheEntry(key, freshData, {
      namespace,
      ttlMs,
      version,
      lastUpdated,
    });

    return {
      data: freshData,
      source: "network",
      stale: false,
      entry,
    };
  } catch (error) {
    if (allowStaleOnError && staleCandidate) {
      return {
        data: staleCandidate.data,
        source: "stale-cache",
        stale: true,
        entry: staleCandidate,
        error,
      };
    }
    throw error;
  }
}

export async function mutateWithCache(config) {
  const {
    mutationFn,
    namespace = DEFAULT_NAMESPACE,
    invalidate = [],
    refetch = [],
  } = config || {};

  if (typeof mutationFn !== "function") {
    throw new Error("mutationFn must be a function");
  }

  const mutationResult = await mutationFn();

  if (invalidate.length > 0) {
    invalidateCacheKeys(invalidate, { namespace });
  }

  const refreshed = {};

  for (const refetchConfig of refetch) {
    if (!refetchConfig?.key || typeof refetchConfig.fetcher !== "function") continue;
    const response = await getOrFetchCached({
      ...refetchConfig,
      namespace: refetchConfig.namespace || namespace,
      forceFresh: true,
      allowStaleOnError: false,
    });
    refreshed[refetchConfig.key] = response.data;
  }

  return {
    mutationResult,
    refreshed,
  };
}

export function createSupabaseRealtimeInvalidator(config) {
  const {
    supabase,
    channelName = "cache-invalidation",
    schema = "public",
    watches = [],
    namespace = DEFAULT_NAMESPACE,
    resolveKeys,
    onEvent,
  } = config || {};

  if (!supabase?.channel || !supabase?.removeChannel) {
    throw new Error("A valid Supabase client is required.");
  }

  const channel = supabase.channel(channelName);

  watches.forEach((watch) => {
    if (!watch?.table) return;

    channel.on(
      "postgres_changes",
      {
        event: watch.event || "*",
        schema: watch.schema || schema,
        table: watch.table,
      },
      (payload) => {
        const keys =
          typeof resolveKeys === "function"
            ? resolveKeys(payload, watch) || []
            : watch.invalidateKeys || [];

        if (Array.isArray(keys) && keys.length > 0) {
          invalidateCacheKeys(keys, { namespace: watch.namespace || namespace });
        }

        if (typeof onEvent === "function") {
          onEvent({ payload, watch, invalidatedKeys: keys });
        }
      }
    );
  });

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
