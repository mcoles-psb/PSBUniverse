import { NextResponse } from "next/server";
import {
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";
import {
  getAuthenticatedContext,
  toErrorResponse,
} from "@/modules/user-master/services/user-master-route-auth.service";

const APP_CARD_GROUP_TABLE =
  String(process.env.USER_MASTER_APP_CARD_GROUP_TABLE || "").trim() || "psb_m_appcardgroup";
const APP_CARD_TABLE =
  String(process.env.USER_MASTER_APP_CARD_TABLE || "").trim() || "psb_s_appcard";
const APP_CARD_ROLE_ACCESS_TABLE =
  String(process.env.USER_MASTER_APP_CARD_ROLE_ACCESS_TABLE || "").trim() || "psb_m_appcardroleaccess";

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function isInactiveFlag(value) {
  if (value === false || value === 0) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "false" || text === "0" || text === "f" || text === "n" || text === "no";
}

function isMappingActive(row) {
  return !isInactiveFlag(row?.is_active);
}

function asText(value) {
  return String(value ?? "").trim();
}

function asNumber(value) {
  if (!hasValue(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueTextValues(values) {
  return Array.from(new Set((values || []).map((value) => asText(value)).filter((value) => hasValue(value))));
}

function constraintError(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function getField(record, candidates = [], fallback = null) {
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(record || {}, candidate)) {
      const value = record?.[candidate];
      if (value !== undefined && value !== null) return value;
    }
  }
  return fallback;
}

function normalizeGroup(record) {
  return {
    raw: record,
    group_id: asText(getField(record, ["group_id", "app_group_id", "card_group_id"])),
    app_id: asText(getField(record, ["app_id", "application_id"])),
    group_name: asText(getField(record, ["group_name", "name", "label"], "Group")) || "Group",
    group_desc: asText(getField(record, ["group_desc", "description"], "")),
    icon: asText(getField(record, ["icon"], "")),
    display_order: asNumber(getField(record, ["display_order", "group_order", "sort_order", "order_no"], 0)) ?? 0,
    is_active: isMappingActive(record),
  };
}

function normalizeCard(record) {
  return {
    raw: record,
    card_id: asText(getField(record, ["card_id", "app_card_id"])),
    group_id: asText(getField(record, ["group_id", "app_group_id", "card_group_id"])),
    app_id: asText(getField(record, ["app_id", "application_id"])),
    card_name: asText(getField(record, ["card_name", "name", "label"], "Card")) || "Card",
    card_desc: asText(getField(record, ["card_desc", "description"], "")),
    route_path: asText(getField(record, ["route_path", "route", "path", "href"], "")),
    icon: asText(getField(record, ["icon"], "")),
    display_order: asNumber(getField(record, ["display_order", "card_order", "sort_order", "order_no"], 0)) ?? 0,
    is_active: isMappingActive(record),
  };
}

function normalizeCardRoleAccess(record) {
  return {
    raw: record,
    card_id: asText(getField(record, ["card_id", "app_card_id"])),
    role_id: asText(getField(record, ["role_id"])),
    is_active: isMappingActive(record),
  };
}

function ensureUniqueGroupOrder(groups, appId) {
  const seen = new Set();
  for (const group of groups) {
    const key = String(group.display_order);
    if (seen.has(key)) {
      throw constraintError(
        `UNIQUE (group_id, display_order) violated by duplicate group display_order ${group.display_order} for app_id ${appId}`
      );
    }
    seen.add(key);
  }
}

function ensureUniqueCardOrder(cards, appId) {
  const seenByGroup = new Map();

  for (const card of cards) {
    if (!seenByGroup.has(card.group_id)) {
      seenByGroup.set(card.group_id, new Set());
    }

    const orderSet = seenByGroup.get(card.group_id);
    const orderKey = String(card.display_order);

    if (orderSet.has(orderKey)) {
      throw constraintError(
        `UNIQUE (group_id, display_order) violated by duplicate card display_order ${card.display_order} in group_id ${card.group_id}, app_id ${appId}`
      );
    }

    orderSet.add(orderKey);
  }
}

function ensureUniqueCardRoleMapping(roleMappings) {
  const seen = new Set();
  for (const mapping of roleMappings) {
    const key = `${mapping.card_id}::${mapping.role_id}`;
    if (seen.has(key)) {
      throw constraintError(
        `UNIQUE (card_id, role_id) violated by duplicate mapping (${mapping.card_id}, ${mapping.role_id})`
      );
    }
    seen.add(key);
  }
}

function toGroupedResponse(groups, cards) {
  const cardsByGroup = cards.reduce((acc, card) => {
    const key = card.group_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(card);
    return acc;
  }, {});

  return groups
    .sort((a, b) => a.display_order - b.display_order)
    .map((group) => ({
      group_id: asNumber(group.group_id) ?? group.group_id,
      group_name: group.group_name,
      group_desc: group.group_desc,
      group_icon: group.icon,
      group_order: group.display_order,
      cards: (cardsByGroup[group.group_id] || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map((card) => ({
          card_id: asNumber(card.card_id) ?? card.card_id,
          card_name: card.card_name,
          card_desc: card.card_desc,
          route_path: card.route_path,
          icon: card.icon,
          display_order: card.display_order,
        })),
    }))
    .filter((group) => group.cards.length > 0);
}

async function getActiveUserAppIds({ supabaseClient, userId, appId }) {
  let query = supabaseClient
    .from(USER_MASTER_TABLES.userAppRoleAccess)
    .select("*")
    .eq(USER_MASTER_COLUMNS.userId, userId);

  if (hasValue(appId)) {
    query = query.eq(USER_MASTER_COLUMNS.appId, appId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Unable to load user roles");

  const activeRows = (data || []).filter((row) => isMappingActive(row));

  return uniqueTextValues(activeRows.map((row) => row?.[USER_MASTER_COLUMNS.appId]));
}

async function loadVisibleCardsForApp({ supabaseClient, userId, appId }) {
  const { data: groupRows, error: groupError } = await supabaseClient
    .from(APP_CARD_GROUP_TABLE)
    .select("*")
    .eq("app_id", appId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (groupError) throw new Error(groupError.message || "Unable to load card groups");

  const groups = (groupRows || [])
    .map(normalizeGroup)
    .filter((group) => group.is_active)
    .filter((group) => hasValue(group.group_id));

  if (groups.length === 0) {
    return [];
  }

  ensureUniqueGroupOrder(groups, appId);

  const groupIds = groups.map((group) => group.group_id);

  const { data: cardRows, error: cardError } = await supabaseClient
    .from(APP_CARD_TABLE)
    .select("*")
    .eq("is_active", true)
    .in("group_id", groupIds)
    .order("display_order", { ascending: true });

  if (cardError) throw new Error(cardError.message || "Unable to load cards");

  const groupById = new Map(groups.map((group) => [group.group_id, group]));

  const cards = (cardRows || [])
    .map(normalizeCard)
    .filter((card) => card.is_active)
    .filter((card) => hasValue(card.card_id) && groupById.has(card.group_id));

  // Enforce that a card cannot cross apps if it carries app_id explicitly.
  const inconsistentCard = cards.find((card) => {
    if (!hasValue(card.app_id)) return false;
    return String(card.app_id) !== String(appId);
  });

  if (inconsistentCard) {
    throw constraintError(
      `Cross-app card assignment is not allowed (card_id ${inconsistentCard.card_id}, card.app_id ${inconsistentCard.app_id}, requested app_id ${appId})`
    );
  }

  ensureUniqueCardOrder(cards, appId);

  if (cards.length === 0) {
    return [];
  }

  const cardIds = cards.map((card) => card.card_id);

  const { data: cardRoleRows, error: cardRoleError } = await supabaseClient
    .from(APP_CARD_ROLE_ACCESS_TABLE)
    .select("*")
    .eq("is_active", true)
    .in("card_id", cardIds);

  if (cardRoleError) throw new Error(cardRoleError.message || "Unable to load card role access");

  const { data: userRoleRows, error: userRoleError } = await supabaseClient
    .from(USER_MASTER_TABLES.userAppRoleAccess)
    .select("*")
    .eq(USER_MASTER_COLUMNS.userId, userId)
    .eq(USER_MASTER_COLUMNS.appId, appId);

  if (userRoleError) throw new Error(userRoleError.message || "Unable to load user roles");

  const userRoleSet = new Set(
    uniqueTextValues(
      (userRoleRows || [])
        .filter((mapping) => isMappingActive(mapping))
        .map((mapping) => mapping?.[USER_MASTER_COLUMNS.roleId])
    )
  );

  if (userRoleSet.size === 0) {
    return [];
  }

  const activeCardRoleMappings = (cardRoleRows || [])
    .map(normalizeCardRoleAccess)
    .filter((mapping) => mapping.is_active)
    .filter((mapping) => hasValue(mapping.card_id) && hasValue(mapping.role_id));

  ensureUniqueCardRoleMapping(activeCardRoleMappings);

  const visibleCardIdSet = new Set(
    activeCardRoleMappings
      .filter((mapping) => userRoleSet.has(asText(mapping.role_id)))
      .map((mapping) => mapping.card_id)
  );
  const visibleCards = cards.filter((card) => visibleCardIdSet.has(card.card_id));

  return toGroupedResponse(groups, visibleCards);
}

async function buildCardsResponse(request, requireAppId) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedAppId =
      searchParams.get("app_id") || searchParams.get("appId") || searchParams.get("application_id");

    if (requireAppId && !hasValue(requestedAppId)) {
      return toErrorResponse("app_id is required", 400);
    }

    const auth = await getAuthenticatedContext();
    if (auth.error) return auth.error;

    if (auth.accountInactive) {
      return toErrorResponse("Account is inactive. App modules are unavailable.", 403);
    }

    if (auth.statusRestricted) {
      return toErrorResponse("Account status does not allow app access right now.", 403);
    }

    const userId = auth.userRecord?.[USER_MASTER_COLUMNS.userId];
    if (!hasValue(userId)) {
      return toErrorResponse("Unable to resolve user account", 401);
    }

    const appIds = await getActiveUserAppIds({
      supabaseClient: auth.supabaseClient,
      userId,
      appId: requestedAppId,
    });

    if (appIds.length === 0) {
      return NextResponse.json(requireAppId ? [] : { success: true, groups: [] });
    }

    const grouped = [];

    for (const appId of appIds) {
      const appGroups = await loadVisibleCardsForApp({
        supabaseClient: auth.supabaseClient,
        userId,
        appId,
      });

      grouped.push(...appGroups);
    }

    return NextResponse.json(requireAppId ? grouped : { success: true, groups: grouped });
  } catch (error) {
    const status = Number(error?.status || 500);
    return toErrorResponse(error?.message || "Unable to load My Apps cards", status);
  }
}

export async function GET(request) {
  return buildCardsResponse(request, false);
}

export async function GETCards(request) {
  return buildCardsResponse(request, true);
}
