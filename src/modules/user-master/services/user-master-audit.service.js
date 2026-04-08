const AUDIT_TABLE_NAME = String(process.env.USER_MASTER_AUDIT_TABLE || "").trim();

function stringifySafe(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Unable to serialize metadata" });
  }
}

export async function recordUserMasterAuditEvent(options = {}) {
  const {
    supabaseClient,
    eventType,
    actorUserId,
    targetUserId = null,
    appKey = null,
    metadata = {},
  } = options;

  const normalizedEventType = String(eventType || "").trim();
  if (!normalizedEventType) {
    return { persisted: false, sink: "none" };
  }

  const payload = {
    eventType: normalizedEventType,
    actorUserId: actorUserId === undefined || actorUserId === null ? null : String(actorUserId),
    targetUserId:
      targetUserId === undefined || targetUserId === null ? null : String(targetUserId),
    appKey: appKey ? String(appKey) : null,
    metadata,
    createdAt: new Date().toISOString(),
  };

  if (!AUDIT_TABLE_NAME || !supabaseClient) {
    console.info("[user-master-audit]", stringifySafe(payload));
    return { persisted: false, sink: "console" };
  }

  const { error } = await supabaseClient.from(AUDIT_TABLE_NAME).insert({
    event_type: payload.eventType,
    actor_user_id: payload.actorUserId,
    target_user_id: payload.targetUserId,
    app_key: payload.appKey,
    details: payload.metadata,
    created_at: payload.createdAt,
  });

  if (error) {
    console.warn(
      "[user-master-audit] Failed to persist event to table",
      AUDIT_TABLE_NAME,
      error.message
    );
    console.info("[user-master-audit]", stringifySafe(payload));
    return { persisted: false, sink: "console" };
  }

  return { persisted: true, sink: AUDIT_TABLE_NAME };
}
