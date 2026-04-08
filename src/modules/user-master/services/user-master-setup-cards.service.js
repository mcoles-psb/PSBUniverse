import { NextResponse } from "next/server";
import {
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";
import {
  ADMIN_ROLE_PERMISSION_MAP,
  requireActionPermission,
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

function toBooleanFlag(value) {
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string" && value.trim().toLowerCase() === "false") return false;
  return Boolean(value);
}

function asText(value) {
  return String(value ?? "").trim();
}

function asNumber(value, fallback = null) {
  if (!hasValue(value)) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueTextValues(values) {
  return Array.from(
    new Set((values || []).map((value) => asText(value)).filter((value) => hasValue(value)))
  );
}

function withStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getAdminAppKey(request) {
  const { searchParams } = new URL(request.url);
  return (
    String(searchParams.get("appKey") || "").trim() ||
    String(process.env.USER_MASTER_ADMIN_APP_KEY || "").trim() ||
    "admin-config"
  );
}

function parseEntity(request, body = {}) {
  const { searchParams } = new URL(request.url);
  return String(body?.entity || searchParams.get("entity") || "").trim().toLowerCase();
}

function parseRoleIds(value) {
  if (!Array.isArray(value)) return [];
  return uniqueTextValues(value);
}

async function assertRolesBelongToApp(supabaseClient, roleIds, appId) {
  const normalizedRoleIds = uniqueTextValues(roleIds);
  if (normalizedRoleIds.length === 0) return;

  const { data, error } = await supabaseClient
    .from(USER_MASTER_TABLES.roles)
    .select("*")
    .in(USER_MASTER_COLUMNS.roleId, normalizedRoleIds);

  if (error) throw error;

  const roleById = new Map(
    (data || []).map((role) => [asText(role?.[USER_MASTER_COLUMNS.roleId]), role])
  );

  for (const roleId of normalizedRoleIds) {
    const role = roleById.get(roleId);
    if (!role) {
      throw withStatus(`Invalid role_id: ${roleId}`, 400);
    }

    const roleAppId = asText(role?.[USER_MASTER_COLUMNS.appId]);
    if (hasValue(roleAppId) && roleAppId !== asText(appId)) {
      throw withStatus(
        `Role ${roleId} does not belong to app_id ${asText(appId)}`,
        409
      );
    }
  }
}

function ensureUniqueGroupOrder(groups, appId) {
  const seen = new Set();
  for (const group of groups) {
    const key = String(group.display_order);
    if (seen.has(key)) {
      throw withStatus(
        `Duplicate group display_order ${group.display_order} for app_id ${appId}`,
        409
      );
    }
    seen.add(key);
  }
}

function ensureUniqueCardOrder(cards, appId) {
  const seenByGroup = new Map();

  for (const card of cards) {
    const groupId = asText(card.group_id);
    if (!seenByGroup.has(groupId)) {
      seenByGroup.set(groupId, new Set());
    }

    const orderSet = seenByGroup.get(groupId);
    const orderKey = String(card.display_order);
    if (orderSet.has(orderKey)) {
      throw withStatus(
        `Duplicate card display_order ${card.display_order} in group_id ${groupId}, app_id ${appId}`,
        409
      );
    }

    orderSet.add(orderKey);
  }
}

function ensureUniqueCardRoleMappings(rows) {
  const seen = new Set();
  for (const row of rows || []) {
    const cardId = asText(row?.card_id);
    const roleId = asText(row?.role_id);
    if (!hasValue(cardId) || !hasValue(roleId)) continue;

    const key = `${cardId}:${roleId}`;
    if (seen.has(key)) {
      throw withStatus(`Duplicate card role mapping (${cardId}, ${roleId})`, 409);
    }
    seen.add(key);
  }
}

async function assertGroupExists(supabaseClient, groupId) {
  const { data, error } = await supabaseClient
    .from(APP_CARD_GROUP_TABLE)
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw withStatus("Group not found", 404);
  return data;
}

async function assertCardExists(supabaseClient, cardId) {
  const { data, error } = await supabaseClient
    .from(APP_CARD_TABLE)
    .select("*")
    .eq("card_id", cardId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw withStatus("Card not found", 404);
  return data;
}

function normalizeGroup(record) {
  return {
    group_id: record?.group_id,
    app_id: record?.app_id,
    group_name: asText(record?.group_name),
    group_desc: asText(record?.group_desc),
    icon: asText(record?.icon),
    display_order: asNumber(record?.display_order, 0),
    is_active: toBooleanFlag(record?.is_active),
  };
}

function normalizeCard(record) {
  return {
    card_id: record?.card_id,
    app_id: record?.app_id,
    group_id: record?.group_id,
    card_name: asText(record?.card_name),
    card_desc: asText(record?.card_desc),
    route_path: asText(record?.route_path),
    icon: asText(record?.icon),
    display_order: asNumber(record?.display_order, 0),
    is_active: toBooleanFlag(record?.is_active),
  };
}

function extractHandledError(error, fallbackMessage) {
  if (Number(error?.status) >= 400) {
    return toErrorResponse(error.message || fallbackMessage, Number(error.status));
  }

  if (String(error?.code || "") === "23505") {
    return toErrorResponse("Duplicate value conflicts with uniqueness constraints", 409);
  }

  if (String(error?.code || "") === "23503") {
    return toErrorResponse("Referenced record does not exist or is still in use", 409);
  }

  return toErrorResponse(error?.message || fallbackMessage, 500);
}

async function getCardsSetupByApp({ supabaseClient, appId }) {
  const { data: groupRows, error: groupError } = await supabaseClient
    .from(APP_CARD_GROUP_TABLE)
    .select("*")
    .eq("app_id", appId)
    .order("display_order", { ascending: true });

  if (groupError) throw groupError;

  const { data: cardRows, error: cardError } = await supabaseClient
    .from(APP_CARD_TABLE)
    .select("*")
    .eq("app_id", appId)
    .order("display_order", { ascending: true });

  if (cardError) throw cardError;

  const groups = (groupRows || []).map(normalizeGroup);
  const cards = (cardRows || []).map(normalizeCard);

  ensureUniqueGroupOrder(groups, appId);
  ensureUniqueCardOrder(cards, appId);

  const groupById = new Map(groups.map((group) => [asText(group.group_id), group]));
  const cardIds = cards.map((card) => card.card_id).filter((value) => hasValue(value));

  const orphanCard = cards.find((card) => !groupById.has(asText(card.group_id)));
  if (orphanCard) {
    throw withStatus(`Card ${orphanCard.card_id} is orphaned (missing group)`, 409);
  }

  const crossAppCard = cards.find((card) => hasValue(card.app_id) && String(card.app_id) !== String(appId));
  if (crossAppCard) {
    throw withStatus(
      `Card ${crossAppCard.card_id} app_id mismatch (card.app_id=${crossAppCard.app_id}, requested app_id=${appId})`,
      409
    );
  }

  let mappingRows = [];
  if (cardIds.length > 0) {
    const mappingRes = await supabaseClient
      .from(APP_CARD_ROLE_ACCESS_TABLE)
      .select("*")
      .in("card_id", cardIds);

    if (mappingRes.error) throw mappingRes.error;
    mappingRows = mappingRes.data || [];
  }

  ensureUniqueCardRoleMappings(mappingRows);

  const roleIds = uniqueTextValues(mappingRows.map((row) => row?.role_id));
  let roleById = new Map();

  if (roleIds.length > 0) {
    const { data: roleRows, error: roleError } = await supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .select("*")
      .in(USER_MASTER_COLUMNS.roleId, roleIds);

    if (roleError) throw roleError;

    roleById = new Map(
      (roleRows || []).map((role) => [asText(role?.[USER_MASTER_COLUMNS.roleId]), role])
    );
  }

  const rolesByCardId = new Map();

  (mappingRows || []).forEach((mapping) => {
    const cardId = asText(mapping?.card_id);
    const roleId = asText(mapping?.role_id);
    if (!hasValue(cardId) || !hasValue(roleId)) return;

    if (!rolesByCardId.has(cardId)) {
      rolesByCardId.set(cardId, []);
    }

    const roleRecord = roleById.get(roleId);

    if (
      roleRecord &&
      hasValue(roleRecord?.[USER_MASTER_COLUMNS.appId]) &&
      String(roleRecord[USER_MASTER_COLUMNS.appId]) !== String(appId)
    ) {
      throw withStatus(
        `Role ${roleId} used by card ${cardId} does not belong to app_id ${appId}`,
        409
      );
    }

    rolesByCardId.get(cardId).push({
      role_id: roleId,
      role_name: asText(roleRecord?.role_name) || `Role ${roleId}`,
      is_active: toBooleanFlag(mapping?.is_active),
      acr_id: mapping?.acr_id,
    });
  });

  return groups
    .sort((a, b) => a.display_order - b.display_order)
    .map((group) => {
      const groupCards = cards
        .filter((card) => String(card.group_id) === String(group.group_id))
        .sort((a, b) => a.display_order - b.display_order)
        .map((card) => {
          const roleRows = (rolesByCardId.get(asText(card.card_id)) || []).filter(
            (row) => row.is_active
          );

          return {
            card_id: card.card_id,
            group_id: card.group_id,
            app_id: card.app_id,
            card_name: card.card_name,
            card_desc: card.card_desc,
            route_path: card.route_path,
            icon: card.icon,
            display_order: card.display_order,
            is_active: card.is_active,
            role_ids: roleRows.map((row) => row.role_id),
            roles: roleRows.map((row) => ({
              role_id: row.role_id,
              role_name: row.role_name,
            })),
          };
        });

      return {
        group_id: group.group_id,
        app_id: group.app_id,
        group_name: group.group_name,
        group_desc: group.group_desc,
        icon: group.icon,
        display_order: group.display_order,
        is_active: group.is_active,
        cards: groupCards,
      };
    });
}

export async function GET(request) {
  try {
    const gate = await requireActionPermission({
      action: "read",
      appKey: getAdminAppKey(request),
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("app_id") || searchParams.get("appId");

    if (!hasValue(appId)) {
      return toErrorResponse("app_id is required", 400);
    }

    const groups = await getCardsSetupByApp({
      supabaseClient: gate.context.supabaseClient,
      appId,
    });

    return NextResponse.json(groups);
  } catch (error) {
    return extractHandledError(error, "Unable to load setup cards");
  }
}

export async function POST(request) {
  try {
    const gate = await requireActionPermission({
      action: "create",
      appKey: getAdminAppKey(request),
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const body = await request.json();
    const entity = parseEntity(request, body);

    if (entity === "group") {
      const appId = body?.app_id ?? body?.appId;
      if (!hasValue(appId)) {
        return toErrorResponse("app_id is required for group creation", 400);
      }

      const payload = {
        app_id: appId,
        group_name: asText(body?.group_name || body?.groupName),
        group_desc: asText(body?.group_desc || body?.groupDesc),
        icon: asText(body?.icon),
        display_order: asNumber(body?.display_order ?? body?.displayOrder, 0),
        is_active: toBooleanFlag(body?.is_active ?? body?.isActive ?? true),
      };

      if (!hasValue(payload.group_name)) {
        return toErrorResponse("group_name is required", 400);
      }

      const { data, error } = await gate.context.supabaseClient
        .from(APP_CARD_GROUP_TABLE)
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: "Group created",
        data: {
          group: data,
        },
      });
    }

    if (entity === "card") {
      const groupId = body?.group_id ?? body?.groupId;
      if (!hasValue(groupId)) {
        return toErrorResponse("group_id is required for card creation", 400);
      }

      const group = await assertGroupExists(gate.context.supabaseClient, groupId);
      const appId = asText(group?.app_id);
      const requestedAppId = asText(body?.app_id ?? body?.appId);

      if (hasValue(requestedAppId) && requestedAppId !== appId) {
        return toErrorResponse("Card app_id must match group app_id", 409);
      }

      const payload = {
        app_id: appId,
        group_id: groupId,
        card_name: asText(body?.card_name || body?.cardName),
        card_desc: asText(body?.card_desc || body?.cardDesc),
        route_path: asText(body?.route_path || body?.routePath),
        icon: asText(body?.icon),
        display_order: asNumber(body?.display_order ?? body?.displayOrder, 0),
        is_active: toBooleanFlag(body?.is_active ?? body?.isActive ?? true),
      };

      if (!hasValue(payload.card_name)) {
        return toErrorResponse("card_name is required", 400);
      }

      if (!hasValue(payload.route_path)) {
        return toErrorResponse("route_path is required", 400);
      }

      const { data: card, error: cardError } = await gate.context.supabaseClient
        .from(APP_CARD_TABLE)
        .insert(payload)
        .select("*")
        .single();

      if (cardError) throw cardError;

      const roleIds = parseRoleIds(body?.role_ids || body?.roleIds || body?.roles);

      await assertRolesBelongToApp(gate.context.supabaseClient, roleIds, appId);

      if (roleIds.length > 0) {
        const roleRows = roleIds.map((roleId) => ({
          card_id: card.card_id,
          role_id: roleId,
          is_active: true,
        }));

        const { error: roleMapError } = await gate.context.supabaseClient
          .from(APP_CARD_ROLE_ACCESS_TABLE)
          .insert(roleRows);

        if (roleMapError) throw roleMapError;
      }

      return NextResponse.json({
        success: true,
        message: "Card created",
        data: {
          card,
        },
      });
    }

    return toErrorResponse("entity must be 'group' or 'card'", 400);
  } catch (error) {
    return extractHandledError(error, "Unable to create setup card item");
  }
}

export async function PATCH(request) {
  try {
    const gate = await requireActionPermission({
      action: "update",
      appKey: getAdminAppKey(request),
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const body = await request.json();
    const entity = parseEntity(request, body);

    if (entity === "group") {
      const groupId = body?.group_id ?? body?.groupId;
      if (!hasValue(groupId)) {
        return toErrorResponse("group_id is required", 400);
      }

      const existingGroup = await assertGroupExists(gate.context.supabaseClient, groupId);
      const updates = {};

      if (Object.prototype.hasOwnProperty.call(body || {}, "group_name")) {
        updates.group_name = asText(body.group_name);
      }

      if (Object.prototype.hasOwnProperty.call(body || {}, "group_desc")) {
        updates.group_desc = asText(body.group_desc);
      }

      if (Object.prototype.hasOwnProperty.call(body || {}, "icon")) {
        updates.icon = asText(body.icon);
      }

      if (
        Object.prototype.hasOwnProperty.call(body || {}, "display_order") ||
        Object.prototype.hasOwnProperty.call(body || {}, "displayOrder")
      ) {
        updates.display_order = asNumber(body.display_order ?? body.displayOrder, 0);
      }

      if (
        Object.prototype.hasOwnProperty.call(body || {}, "is_active") ||
        Object.prototype.hasOwnProperty.call(body || {}, "isActive")
      ) {
        updates.is_active = toBooleanFlag(body.is_active ?? body.isActive);
      }

      if (
        Object.prototype.hasOwnProperty.call(body || {}, "app_id") ||
        Object.prototype.hasOwnProperty.call(body || {}, "appId")
      ) {
        const nextAppId = asText(body.app_id ?? body.appId);
        if (hasValue(nextAppId) && nextAppId !== asText(existingGroup.app_id)) {
          return toErrorResponse("Group app_id cannot be changed", 409);
        }
      }

      if (Object.keys(updates).length === 0) {
        return toErrorResponse("No group update fields were provided", 400);
      }

      const { data: group, error: groupError } = await gate.context.supabaseClient
        .from(APP_CARD_GROUP_TABLE)
        .update(updates)
        .eq("group_id", groupId)
        .select("*")
        .single();

      if (groupError) throw groupError;

      if (updates.is_active === false) {
        const { error: cardDisableError } = await gate.context.supabaseClient
          .from(APP_CARD_TABLE)
          .update({ is_active: false })
          .eq("group_id", groupId)
          .eq("is_active", true);

        if (cardDisableError) throw cardDisableError;
      }

      return NextResponse.json({
        success: true,
        message: "Group updated",
        data: {
          group,
        },
      });
    }

    if (entity === "card") {
      const cardId = body?.card_id ?? body?.cardId;
      if (!hasValue(cardId)) {
        return toErrorResponse("card_id is required", 400);
      }

      const existingCard = await assertCardExists(gate.context.supabaseClient, cardId);
      let resolvedGroupId = asText(existingCard.group_id);
      let resolvedAppId = asText(existingCard.app_id);

      if (Object.prototype.hasOwnProperty.call(body || {}, "group_id")) {
        const targetGroupId = asText(body.group_id);
        if (!hasValue(targetGroupId)) {
          return toErrorResponse("group_id cannot be empty", 400);
        }

        const targetGroup = await assertGroupExists(gate.context.supabaseClient, targetGroupId);
        resolvedGroupId = asText(targetGroup.group_id);
        resolvedAppId = asText(targetGroup.app_id);
      }

      if (
        Object.prototype.hasOwnProperty.call(body || {}, "app_id") ||
        Object.prototype.hasOwnProperty.call(body || {}, "appId")
      ) {
        const requestedAppId = asText(body.app_id ?? body.appId);
        if (hasValue(requestedAppId) && requestedAppId !== resolvedAppId) {
          return toErrorResponse("Card app_id must match card group app_id", 409);
        }
      }

      const group = await assertGroupExists(gate.context.supabaseClient, resolvedGroupId);
      const groupIsActive = toBooleanFlag(group?.is_active);

      const updates = {
        app_id: resolvedAppId,
        group_id: resolvedGroupId,
      };

      if (Object.prototype.hasOwnProperty.call(body || {}, "card_name")) {
        updates.card_name = asText(body.card_name);
      }

      if (Object.prototype.hasOwnProperty.call(body || {}, "card_desc")) {
        updates.card_desc = asText(body.card_desc);
      }

      if (Object.prototype.hasOwnProperty.call(body || {}, "route_path")) {
        updates.route_path = asText(body.route_path);
      }

      if (Object.prototype.hasOwnProperty.call(body || {}, "icon")) {
        updates.icon = asText(body.icon);
      }

      if (
        Object.prototype.hasOwnProperty.call(body || {}, "display_order") ||
        Object.prototype.hasOwnProperty.call(body || {}, "displayOrder")
      ) {
        updates.display_order = asNumber(body.display_order ?? body.displayOrder, 0);
      }

      if (
        Object.prototype.hasOwnProperty.call(body || {}, "is_active") ||
        Object.prototype.hasOwnProperty.call(body || {}, "isActive")
      ) {
        const nextActive = toBooleanFlag(body.is_active ?? body.isActive);
        if (nextActive && !groupIsActive) {
          return toErrorResponse("Cannot activate a card under an inactive group", 409);
        }
        updates.is_active = nextActive;
      }

      const hasOnlyIdentityFields =
        Object.keys(updates).length === 2 &&
        !Object.prototype.hasOwnProperty.call(body || {}, "role_ids") &&
        !Object.prototype.hasOwnProperty.call(body || {}, "roleIds") &&
        !Object.prototype.hasOwnProperty.call(body || {}, "roles");

      if (hasOnlyIdentityFields) {
        return toErrorResponse("No card update fields were provided", 400);
      }

      const { data: card, error: cardError } = await gate.context.supabaseClient
        .from(APP_CARD_TABLE)
        .update(updates)
        .eq("card_id", cardId)
        .select("*")
        .single();

      if (cardError) throw cardError;

      const roleIdsProvided =
        Object.prototype.hasOwnProperty.call(body || {}, "role_ids") ||
        Object.prototype.hasOwnProperty.call(body || {}, "roleIds") ||
        Object.prototype.hasOwnProperty.call(body || {}, "roles");

      if (roleIdsProvided) {
        const desiredRoleIds = parseRoleIds(body.role_ids || body.roleIds || body.roles);

        await assertRolesBelongToApp(
          gate.context.supabaseClient,
          desiredRoleIds,
          resolvedAppId
        );

        const { data: existingRows, error: mappingError } = await gate.context.supabaseClient
          .from(APP_CARD_ROLE_ACCESS_TABLE)
          .select("*")
          .eq("card_id", cardId);

        if (mappingError) throw mappingError;

        ensureUniqueCardRoleMappings(existingRows || []);

        const existingByRoleId = new Map(
          (existingRows || []).map((row) => [asText(row.role_id), row])
        );

        const toDisable = (existingRows || [])
          .filter((row) => toBooleanFlag(row.is_active))
          .map((row) => asText(row.role_id))
          .filter((roleId) => !desiredRoleIds.includes(roleId));

        const toEnable = (existingRows || [])
          .filter((row) => !toBooleanFlag(row.is_active))
          .map((row) => asText(row.role_id))
          .filter((roleId) => desiredRoleIds.includes(roleId));

        const toInsert = desiredRoleIds.filter((roleId) => !existingByRoleId.has(roleId));

        if (toDisable.length > 0) {
          const { error: disableError } = await gate.context.supabaseClient
            .from(APP_CARD_ROLE_ACCESS_TABLE)
            .update({ is_active: false })
            .eq("card_id", cardId)
            .in("role_id", toDisable);

          if (disableError) throw disableError;
        }

        if (toEnable.length > 0) {
          const { error: enableError } = await gate.context.supabaseClient
            .from(APP_CARD_ROLE_ACCESS_TABLE)
            .update({ is_active: true })
            .eq("card_id", cardId)
            .in("role_id", toEnable);

          if (enableError) throw enableError;
        }

        if (toInsert.length > 0) {
          const rowsToInsert = toInsert.map((roleId) => ({
            card_id: cardId,
            role_id: roleId,
            is_active: true,
          }));

          const { error: insertError } = await gate.context.supabaseClient
            .from(APP_CARD_ROLE_ACCESS_TABLE)
            .insert(rowsToInsert);

          if (insertError) throw insertError;
        }
      }

      return NextResponse.json({
        success: true,
        message: "Card updated",
        data: {
          card,
        },
      });
    }

    return toErrorResponse("entity must be 'group' or 'card'", 400);
  } catch (error) {
    return extractHandledError(error, "Unable to update setup card item");
  }
}

export async function DELETE(request) {
  try {
    const gate = await requireActionPermission({
      action: "delete",
      appKey: getAdminAppKey(request),
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);
    const entity = String(searchParams.get("entity") || "").trim().toLowerCase();

    if (entity === "group") {
      const groupId = searchParams.get("group_id") || searchParams.get("groupId");
      if (!hasValue(groupId)) {
        return toErrorResponse("group_id is required", 400);
      }

      const { count, error: countError } = await gate.context.supabaseClient
        .from(APP_CARD_TABLE)
        .select("card_id", { count: "exact", head: true })
        .eq("group_id", groupId);

      if (countError) throw countError;

      if (Number(count || 0) > 0) {
        return toErrorResponse("Cannot delete group while it still has cards", 409);
      }

      const { error } = await gate.context.supabaseClient
        .from(APP_CARD_GROUP_TABLE)
        .delete()
        .eq("group_id", groupId);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: "Group deleted",
        data: {
          group_id: groupId,
          deleted: true,
        },
      });
    }

    if (entity === "card") {
      const cardId = searchParams.get("card_id") || searchParams.get("cardId");
      if (!hasValue(cardId)) {
        return toErrorResponse("card_id is required", 400);
      }

      const { error: deleteMappingsError } = await gate.context.supabaseClient
        .from(APP_CARD_ROLE_ACCESS_TABLE)
        .delete()
        .eq("card_id", cardId);

      if (deleteMappingsError) throw deleteMappingsError;

      const { error: deleteCardError } = await gate.context.supabaseClient
        .from(APP_CARD_TABLE)
        .delete()
        .eq("card_id", cardId);

      if (deleteCardError) throw deleteCardError;

      return NextResponse.json({
        success: true,
        message: "Card deleted",
        data: {
          card_id: cardId,
          deleted: true,
        },
      });
    }

    return toErrorResponse("entity must be 'group' or 'card'", 400);
  } catch (error) {
    return extractHandledError(error, "Unable to delete setup card item");
  }
}
