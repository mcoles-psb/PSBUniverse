import {
  createCacheKey,
  getOrFetchCached,
  invalidateCacheKeys,
  setCacheEntry,
} from "@/core/cache";

export const USER_MASTER_CACHE_NAMESPACE = "psb-universe";

export const USER_MASTER_CACHE_TTL = {
  sessionMs: 30 * 60 * 1000,
  accessMs: 20 * 60 * 1000,
  profileMs: 15 * 60 * 1000,
  refsMs: 8 * 60 * 60 * 1000,
  listsMs: 10 * 60 * 1000,
};

export const USER_MASTER_CACHE_KEYS = {
  session: createCacheKey("user-master", "session"),
  profile: createCacheKey("user-master", "profile"),
  bootstrap: createCacheKey("user-master", "bootstrap"),
  access: (appKey = "global") => createCacheKey("user-master", "access", appKey || "global"),
  companies: createCacheKey("user-master", "ref", "companies"),
  departments: createCacheKey("user-master", "ref", "departments"),
  statuses: createCacheKey("user-master", "ref", "statuses"),
  roles: createCacheKey("user-master", "ref", "roles"),
  applications: createCacheKey("user-master", "ref", "applications"),
  users: createCacheKey("user-master", "list", "users"),
  mappings: createCacheKey("user-master", "list", "mappings"),
};

async function fetchJson(url, requestOptions) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    ...(requestOptions || {}),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function getCachedJson(config = {}) {
  const {
    key,
    url,
    ttlMs,
    forceFresh = false,
    allowStaleOnError = true,
    requestOptions,
  } = config;

  if (!key || !url) {
    throw new Error("key and url are required for getCachedJson");
  }

  const cached = await getOrFetchCached({
    key,
    namespace: USER_MASTER_CACHE_NAMESPACE,
    ttlMs,
    forceFresh,
    allowStaleOnError,
    fetcher: () => fetchJson(url, requestOptions),
  });

  return cached.data;
}

export function cacheSessionData(config = {}) {
  const { session, user, access, appKey = "global" } = config;

  if (session) {
    setCacheEntry(USER_MASTER_CACHE_KEYS.session, session, {
      namespace: USER_MASTER_CACHE_NAMESPACE,
      ttlMs: USER_MASTER_CACHE_TTL.sessionMs,
    });
  }

  if (user) {
    setCacheEntry(USER_MASTER_CACHE_KEYS.profile, user, {
      namespace: USER_MASTER_CACHE_NAMESPACE,
      ttlMs: USER_MASTER_CACHE_TTL.profileMs,
    });
  }

  if (access) {
    setCacheEntry(USER_MASTER_CACHE_KEYS.access(appKey), access, {
      namespace: USER_MASTER_CACHE_NAMESPACE,
      ttlMs: USER_MASTER_CACHE_TTL.accessMs,
    });
  }
}

export function cacheReferenceData(referencePayload = {}) {
  const {
    companies,
    departments,
    statuses,
    roles,
    applications,
  } = referencePayload;

  const writes = [
    [USER_MASTER_CACHE_KEYS.companies, companies],
    [USER_MASTER_CACHE_KEYS.departments, departments],
    [USER_MASTER_CACHE_KEYS.statuses, statuses],
    [USER_MASTER_CACHE_KEYS.roles, roles],
    [USER_MASTER_CACHE_KEYS.applications, applications],
  ];

  writes.forEach(([key, value]) => {
    if (!Array.isArray(value)) return;
    setCacheEntry(key, value, {
      namespace: USER_MASTER_CACHE_NAMESPACE,
      ttlMs: USER_MASTER_CACHE_TTL.refsMs,
    });
  });
}

export function invalidateUserMasterCache(cacheKeys = []) {
  invalidateCacheKeys(cacheKeys, {
    namespace: USER_MASTER_CACHE_NAMESPACE,
  });
}

export function clearSessionCache(appKey = "global") {
  invalidateUserMasterCache([
    USER_MASTER_CACHE_KEYS.session,
    USER_MASTER_CACHE_KEYS.profile,
    USER_MASTER_CACHE_KEYS.access(appKey),
  ]);
}
