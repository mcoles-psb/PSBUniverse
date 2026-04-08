"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Form, Modal, Spinner, Tab, Table, Tabs } from "react-bootstrap";
import { toastError, toastSuccess } from "@/shared/utils/toast";

const ADMIN_APP_KEY = "admin-config";

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function asText(value) {
  return String(value ?? "").trim();
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function emptyGroupDraft() {
  return {
    group_id: null,
    group_name: "",
    group_desc: "",
    icon: "",
    display_order: 0,
    is_active: true,
  };
}

function emptyCardDraft() {
  return {
    card_id: null,
    group_id: null,
    card_name: "",
    card_desc: "",
    route_path: "",
    icon: "",
    display_order: 0,
    is_active: true,
    role_ids: [],
  };
}

export default function SetupCardsTab({ applications = [], roles = [] }) {
  const [selectedAppId, setSelectedAppId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [groups, setGroups] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});

  const [groupModal, setGroupModal] = useState({
    show: false,
    mode: "create",
    draft: emptyGroupDraft(),
  });

  const [cardModal, setCardModal] = useState({
    show: false,
    mode: "create",
    draft: emptyCardDraft(),
  });

  const appOptions = useMemo(() => {
    return (applications || [])
      .map((app) => ({
        app_id: app?.app_id,
        app_name: asText(app?.app_name) || `App ${app?.app_id}`,
        is_active: app?.is_active !== false,
      }))
      .filter((app) => hasValue(app.app_id))
      .sort((a, b) => a.app_name.localeCompare(b.app_name));
  }, [applications]);

  const scopedRoles = useMemo(() => {
    if (!hasValue(selectedAppId)) return [];

    return (roles || [])
      .filter((role) => String(role?.app_id || "") === String(selectedAppId))
      .filter((role) => role?.is_active !== false)
      .sort((a, b) => asText(a?.role_name).localeCompare(asText(b?.role_name)));
  }, [roles, selectedAppId]);

  useEffect(() => {
    if (appOptions.length === 0) {
      setSelectedAppId("");
      return;
    }

    const exists = appOptions.some((item) => String(item.app_id) === String(selectedAppId));
    if (!hasValue(selectedAppId) || !exists) {
      setSelectedAppId(String(appOptions[0].app_id));
    }
  }, [appOptions, selectedAppId]);

  async function callApi(url, method, body) {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || payload?.error || `${method} failed (${response.status})`);
    }

    return payload;
  }

  const loadGroups = useCallback(async (appId) => {
    if (!hasValue(appId)) {
      setGroups([]);
      setExpandedGroups({});
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/setup/cards?app_id=${encodeURIComponent(appId)}&appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load card setup.");
      }

      const nextGroups = Array.isArray(payload) ? payload : [];
      setGroups(nextGroups);

      if (nextGroups.length > 0) {
        const firstGroupId = String(nextGroups[0].group_id);
        setExpandedGroups({ [firstGroupId]: true });
      } else {
        setExpandedGroups({});
      }
    } catch (error) {
      setGroups([]);
      setExpandedGroups({});
      setErrorMessage(error?.message || "Unable to load card setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasValue(selectedAppId)) return;
    void loadGroups(selectedAppId);
  }, [loadGroups, selectedAppId]);

  const toggleGroupExpanded = useCallback((groupId) => {
    setExpandedGroups((previous) => ({
      ...previous,
      [String(groupId)]: !previous[String(groupId)],
    }));
  }, []);

  const openCreateGroup = useCallback(() => {
    const nextOrder =
      groups.reduce((max, item) => Math.max(max, asNumber(item?.display_order, 0)), 0) + 1;

    setGroupModal({
      show: true,
      mode: "create",
      draft: {
        ...emptyGroupDraft(),
        display_order: nextOrder,
      },
    });
  }, [groups]);

  const openEditGroup = useCallback((group) => {
    setGroupModal({
      show: true,
      mode: "edit",
      draft: {
        group_id: group?.group_id,
        group_name: asText(group?.group_name),
        group_desc: asText(group?.group_desc),
        icon: asText(group?.icon),
        display_order: asNumber(group?.display_order, 0),
        is_active: group?.is_active !== false,
      },
    });
  }, []);

  const closeGroupModal = useCallback(() => {
    setGroupModal((previous) => ({
      ...previous,
      show: false,
    }));
  }, []);

  const submitGroupModal = useCallback(
    async (event) => {
      event.preventDefault();
      if (!hasValue(selectedAppId)) return;

      const draft = groupModal.draft;
      if (!hasValue(draft.group_name)) {
        toastError("Group name is required.", "Setup Cards");
        return;
      }

      setSaving(true);

      try {
        const method = groupModal.mode === "create" ? "POST" : "PATCH";

        await callApi(`/api/setup/cards?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`, method, {
          entity: "group",
          app_id: selectedAppId,
          group_id: draft.group_id,
          group_name: draft.group_name,
          group_desc: draft.group_desc,
          icon: draft.icon,
          display_order: asNumber(draft.display_order, 0),
          is_active: Boolean(draft.is_active),
        });

        closeGroupModal();
        await loadGroups(selectedAppId);
        toastSuccess(
          groupModal.mode === "create" ? "Group added." : "Group updated.",
          "Setup Cards"
        );
      } catch (error) {
        toastError(error?.message || "Unable to save group.", "Setup Cards");
      } finally {
        setSaving(false);
      }
    },
    [closeGroupModal, groupModal.draft, groupModal.mode, loadGroups, selectedAppId]
  );

  const toggleGroupActive = useCallback(
    async (group, nextValue) => {
      if (!group?.group_id) return;
      setSaving(true);

      try {
        await callApi(`/api/setup/cards?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`, "PATCH", {
          entity: "group",
          group_id: group.group_id,
          is_active: Boolean(nextValue),
        });

        await loadGroups(selectedAppId);
      } catch (error) {
        toastError(error?.message || "Unable to update group active state.", "Setup Cards");
      } finally {
        setSaving(false);
      }
    },
    [loadGroups, selectedAppId]
  );

  const updateGroupOrder = useCallback(
    async (group, nextOrderValue) => {
      if (!group?.group_id) return;
      const parsed = asNumber(nextOrderValue, group.display_order || 0);
      if (parsed === asNumber(group.display_order, 0)) return;

      setSaving(true);

      try {
        await callApi(`/api/setup/cards?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`, "PATCH", {
          entity: "group",
          group_id: group.group_id,
          display_order: parsed,
        });

        await loadGroups(selectedAppId);
      } catch (error) {
        toastError(error?.message || "Unable to update group order.", "Setup Cards");
      } finally {
        setSaving(false);
      }
    },
    [loadGroups, selectedAppId]
  );

  const removeGroup = useCallback(
    async (group) => {
      if (!group?.group_id) return;

      const okay = window.confirm(`Delete group \"${group.group_name || group.group_id}\"?`);
      if (!okay) return;

      setSaving(true);

      try {
        await callApi(
          `/api/setup/cards?entity=group&group_id=${encodeURIComponent(group.group_id)}&appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "DELETE"
        );

        await loadGroups(selectedAppId);
        toastSuccess("Group deleted.", "Setup Cards");
      } catch (error) {
        toastError(error?.message || "Unable to delete group.", "Setup Cards");
      } finally {
        setSaving(false);
      }
    },
    [loadGroups, selectedAppId]
  );

  const openCreateCard = useCallback((group) => {
    const cards = Array.isArray(group?.cards) ? group.cards : [];
    const nextOrder = cards.reduce((max, card) => Math.max(max, asNumber(card?.display_order, 0)), 0) + 1;

    setCardModal({
      show: true,
      mode: "create",
      draft: {
        ...emptyCardDraft(),
        group_id: group?.group_id,
        display_order: nextOrder,
      },
    });
  }, []);

  const openEditCard = useCallback((card) => {
    const roleIds = Array.isArray(card?.role_ids)
      ? card.role_ids.map((value) => String(value))
      : Array.isArray(card?.roles)
      ? card.roles.map((item) => String(item?.role_id || "")).filter(Boolean)
      : [];

    setCardModal({
      show: true,
      mode: "edit",
      draft: {
        card_id: card?.card_id,
        group_id: card?.group_id,
        card_name: asText(card?.card_name),
        card_desc: asText(card?.card_desc),
        route_path: asText(card?.route_path),
        icon: asText(card?.icon),
        display_order: asNumber(card?.display_order, 0),
        is_active: card?.is_active !== false,
        role_ids: roleIds,
      },
    });
  }, []);

  const closeCardModal = useCallback(() => {
    setCardModal((previous) => ({
      ...previous,
      show: false,
    }));
  }, []);

  const submitCardModal = useCallback(
    async (event) => {
      event.preventDefault();
      if (!hasValue(selectedAppId)) return;

      const draft = cardModal.draft;

      if (!hasValue(draft.group_id)) {
        toastError("A parent group is required.", "Setup Cards");
        return;
      }

      if (!hasValue(draft.card_name)) {
        toastError("Card name is required.", "Setup Cards");
        return;
      }

      if (!hasValue(draft.route_path)) {
        toastError("Route path is required.", "Setup Cards");
        return;
      }

      setSaving(true);

      try {
        const method = cardModal.mode === "create" ? "POST" : "PATCH";

        await callApi(`/api/setup/cards?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`, method, {
          entity: "card",
          app_id: selectedAppId,
          card_id: draft.card_id,
          group_id: draft.group_id,
          card_name: draft.card_name,
          card_desc: draft.card_desc,
          route_path: draft.route_path,
          icon: draft.icon,
          display_order: asNumber(draft.display_order, 0),
          is_active: Boolean(draft.is_active),
          role_ids: draft.role_ids,
        });

        closeCardModal();
        await loadGroups(selectedAppId);
        toastSuccess(
          cardModal.mode === "create" ? "Card added." : "Card updated.",
          "Setup Cards"
        );
      } catch (error) {
        toastError(error?.message || "Unable to save card.", "Setup Cards");
      } finally {
        setSaving(false);
      }
    },
    [cardModal.draft, cardModal.mode, closeCardModal, loadGroups, selectedAppId]
  );

  const toggleCardActive = useCallback(
    async (card, nextValue) => {
      if (!card?.card_id) return;
      setSaving(true);

      try {
        await callApi(`/api/setup/cards?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`, "PATCH", {
          entity: "card",
          card_id: card.card_id,
          is_active: Boolean(nextValue),
        });

        await loadGroups(selectedAppId);
      } catch (error) {
        toastError(error?.message || "Unable to update card active state.", "Setup Cards");
      } finally {
        setSaving(false);
      }
    },
    [loadGroups, selectedAppId]
  );

  const updateCardOrder = useCallback(
    async (card, nextOrderValue) => {
      if (!card?.card_id) return;
      const parsed = asNumber(nextOrderValue, card.display_order || 0);
      if (parsed === asNumber(card.display_order, 0)) return;

      setSaving(true);

      try {
        await callApi(`/api/setup/cards?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`, "PATCH", {
          entity: "card",
          card_id: card.card_id,
          display_order: parsed,
        });

        await loadGroups(selectedAppId);
      } catch (error) {
        toastError(error?.message || "Unable to update card order.", "Setup Cards");
      } finally {
        setSaving(false);
      }
    },
    [loadGroups, selectedAppId]
  );

  const removeCard = useCallback(
    async (card) => {
      if (!card?.card_id) return;

      const okay = window.confirm(`Delete card \"${card.card_name || card.card_id}\"?`);
      if (!okay) return;

      setSaving(true);

      try {
        await callApi(
          `/api/setup/cards?entity=card&card_id=${encodeURIComponent(card.card_id)}&appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "DELETE"
        );

        await loadGroups(selectedAppId);
        toastSuccess("Card deleted.", "Setup Cards");
      } catch (error) {
        toastError(error?.message || "Unable to delete card.", "Setup Cards");
      } finally {
        setSaving(false);
      }
    },
    [loadGroups, selectedAppId]
  );

  if (appOptions.length === 0) {
    return <div className="notice-banner notice-banner-warning">No applications are available.</div>;
  }

  return (
    <div className="setup-cards-shell">
      <Tabs
        id="setup-cards-app-tabs"
        activeKey={selectedAppId}
        onSelect={(key) => setSelectedAppId(String(key || ""))}
        className="mb-3 setup-cards-app-tabs"
      >
        {appOptions.map((app) => (
          <Tab
            key={`setup-cards-app-${app.app_id}`}
            eventKey={String(app.app_id)}
            title={
              <span className="d-inline-flex align-items-center gap-1">
                <span>{app.app_name}</span>
                {!app.is_active ? <Badge bg="secondary">Inactive</Badge> : null}
              </span>
            }
          >
            <Card className="setup-cards-panel border-0 shadow-sm">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-semibold">Card Groups</div>
                  <div className="small text-muted">Manage hierarchy for this application only.</div>
                </div>
                <div className="d-flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => void loadGroups(selectedAppId)}
                    disabled={loading || saving}
                  >
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={openCreateGroup}
                    disabled={loading || saving}
                  >
                    + Add Group
                  </Button>
                </div>
              </Card.Header>

              <Card.Body>
                {loading ? (
                  <div className="d-flex align-items-center gap-2 text-muted">
                    <Spinner size="sm" animation="border" />
                    <span>Loading card groups...</span>
                  </div>
                ) : hasValue(errorMessage) ? (
                  <div className="notice-banner notice-banner-danger">{errorMessage}</div>
                ) : groups.length === 0 ? (
                  <div className="notice-banner notice-banner-muted">
                    No card groups found for this application.
                  </div>
                ) : (
                  <div className="setup-cards-groups-stack">
                    {groups.map((group) => {
                      const groupId = String(group.group_id);
                      const isExpanded = Boolean(expandedGroups[groupId]);

                      return (
                        <Card key={`setup-group-${groupId}`} className="setup-cards-group-card">
                          <Card.Header className="setup-cards-group-header">
                            <div className="setup-cards-group-title-wrap">
                              <Button
                                type="button"
                                variant="link"
                                className="setup-cards-group-toggle"
                                onClick={() => toggleGroupExpanded(group.group_id)}
                              >
                                <i
                                  className={`bi ${isExpanded ? "bi-chevron-down" : "bi-chevron-right"}`}
                                  aria-hidden="true"
                                />
                                <span className="setup-cards-group-title">{group.group_name || "Group"}</span>
                              </Button>

                              <div className="small text-muted setup-cards-group-desc">
                                {group.group_desc || "No description"}
                              </div>
                            </div>

                            <div className="setup-cards-group-controls">
                              <div className="d-flex align-items-center gap-2">
                                <span className="small text-muted">Order</span>
                                <Form.Control
                                  type="number"
                                  size="sm"
                                  className="setup-cards-order-input"
                                  defaultValue={group.display_order}
                                  onBlur={(event) => void updateGroupOrder(group, event.target.value)}
                                />
                              </div>

                              <Form.Check
                                type="switch"
                                id={`setup-group-active-${groupId}`}
                                label="Active"
                                checked={Boolean(group.is_active)}
                                onChange={(event) => void toggleGroupActive(group, event.target.checked)}
                                disabled={saving}
                              />

                              <Button
                                type="button"
                                size="sm"
                                variant="outline-primary"
                                onClick={() => openEditGroup(group)}
                                disabled={saving}
                              >
                                Edit
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                variant="outline-dark"
                                onClick={() => openCreateCard(group)}
                                disabled={saving}
                              >
                                + Add Card
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                variant="outline-danger"
                                onClick={() => void removeGroup(group)}
                                disabled={saving}
                              >
                                Delete
                              </Button>
                            </div>
                          </Card.Header>

                          {isExpanded ? (
                            <Card.Body className="setup-cards-group-body">
                              {Array.isArray(group.cards) && group.cards.length > 0 ? (
                                <Table size="sm" bordered hover className="admin-data-table setup-cards-table mb-0">
                                  <thead>
                                    <tr>
                                      <th>Card Name</th>
                                      <th>Route Path</th>
                                      <th>Roles</th>
                                      <th>Order</th>
                                      <th>Active</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.cards.map((card) => {
                                      const cardRoleNames = Array.isArray(card.roles)
                                        ? card.roles
                                            .map((item) => asText(item?.role_name || item?.role_id))
                                            .filter(Boolean)
                                        : [];

                                      return (
                                        <tr key={`setup-card-${card.card_id}`}>
                                          <td>
                                            <div className="fw-semibold">{card.card_name || "Card"}</div>
                                            <div className="small text-muted">{card.card_desc || "No description"}</div>
                                          </td>
                                          <td>{card.route_path || "--"}</td>
                                          <td>
                                            {cardRoleNames.length > 0
                                              ? cardRoleNames.join(", ")
                                              : "--"}
                                          </td>
                                          <td>
                                            <Form.Control
                                              type="number"
                                              size="sm"
                                              className="setup-cards-order-input"
                                              defaultValue={card.display_order}
                                              onBlur={(event) =>
                                                void updateCardOrder(card, event.target.value)
                                              }
                                            />
                                          </td>
                                          <td>
                                            <Form.Check
                                              type="switch"
                                              id={`setup-card-active-${card.card_id}`}
                                              label=""
                                              checked={Boolean(card.is_active)}
                                              onChange={(event) =>
                                                void toggleCardActive(card, event.target.checked)
                                              }
                                              disabled={saving || !group.is_active}
                                            />
                                          </td>
                                          <td>
                                            <div className="d-flex gap-1">
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline-primary"
                                                onClick={() => openEditCard(card)}
                                                disabled={saving}
                                              >
                                                Edit
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline-danger"
                                                onClick={() => void removeCard(card)}
                                                disabled={saving}
                                              >
                                                Delete
                                              </Button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </Table>
                              ) : (
                                <div className="setup-cards-empty">No cards in this group.</div>
                              )}
                            </Card.Body>
                          ) : null}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </Card.Body>
            </Card>
          </Tab>
        ))}
      </Tabs>

      <Modal show={groupModal.show} onHide={closeGroupModal} centered>
        <Form onSubmit={submitGroupModal}>
          <Modal.Header closeButton>
            <Modal.Title>{groupModal.mode === "create" ? "Add Group" : "Edit Group"}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Group Name</Form.Label>
              <Form.Control
                value={groupModal.draft.group_name}
                onChange={(event) =>
                  setGroupModal((previous) => ({
                    ...previous,
                    draft: { ...previous.draft, group_name: event.target.value },
                  }))
                }
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                value={groupModal.draft.group_desc}
                onChange={(event) =>
                  setGroupModal((previous) => ({
                    ...previous,
                    draft: { ...previous.draft, group_desc: event.target.value },
                  }))
                }
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Display Order</Form.Label>
              <Form.Control
                type="number"
                value={groupModal.draft.display_order}
                onChange={(event) =>
                  setGroupModal((previous) => ({
                    ...previous,
                    draft: {
                      ...previous.draft,
                      display_order: asNumber(event.target.value, 0),
                    },
                  }))
                }
              />
            </Form.Group>

            <Form.Check
              type="switch"
              label="Active"
              checked={Boolean(groupModal.draft.is_active)}
              onChange={(event) =>
                setGroupModal((previous) => ({
                  ...previous,
                  draft: { ...previous.draft, is_active: event.target.checked },
                }))
              }
            />
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline-secondary" onClick={closeGroupModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : groupModal.mode === "create" ? "Add Group" : "Save Changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={cardModal.show} onHide={closeCardModal} centered>
        <Form onSubmit={submitCardModal}>
          <Modal.Header closeButton>
            <Modal.Title>{cardModal.mode === "create" ? "Add Card" : "Edit Card"}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Card Name</Form.Label>
              <Form.Control
                value={cardModal.draft.card_name}
                onChange={(event) =>
                  setCardModal((previous) => ({
                    ...previous,
                    draft: { ...previous.draft, card_name: event.target.value },
                  }))
                }
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                value={cardModal.draft.card_desc}
                onChange={(event) =>
                  setCardModal((previous) => ({
                    ...previous,
                    draft: { ...previous.draft, card_desc: event.target.value },
                  }))
                }
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Route Path</Form.Label>
              <Form.Control
                value={cardModal.draft.route_path}
                onChange={(event) =>
                  setCardModal((previous) => ({
                    ...previous,
                    draft: { ...previous.draft, route_path: event.target.value },
                  }))
                }
                placeholder="/quotes"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Icon</Form.Label>
              <Form.Control
                value={cardModal.draft.icon}
                onChange={(event) =>
                  setCardModal((previous) => ({
                    ...previous,
                    draft: { ...previous.draft, icon: event.target.value },
                  }))
                }
                placeholder="bi-file-earmark"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Display Order</Form.Label>
              <Form.Control
                type="number"
                value={cardModal.draft.display_order}
                onChange={(event) =>
                  setCardModal((previous) => ({
                    ...previous,
                    draft: {
                      ...previous.draft,
                      display_order: asNumber(event.target.value, 0),
                    },
                  }))
                }
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Roles</Form.Label>
              {scopedRoles.length === 0 ? (
                <div className="notice-banner notice-banner-muted mb-0">
                  No roles available for assignment.
                </div>
              ) : (
                <div className="setup-cards-role-checklist">
                  {scopedRoles.map((role) => {
                    const roleId = String(role.role_id);
                    const checked = Array.isArray(cardModal.draft.role_ids)
                      ? cardModal.draft.role_ids.includes(roleId)
                      : false;

                    return (
                      <Form.Check
                        key={`setup-card-role-${roleId}`}
                        id={`setup-card-role-check-${roleId}`}
                        type="checkbox"
                        label={asText(role.role_name) || `Role ${roleId}`}
                        checked={checked}
                        onChange={(event) => {
                          const isChecked = event.target.checked;
                          setCardModal((previous) => {
                            const current = Array.isArray(previous.draft.role_ids)
                              ? previous.draft.role_ids.map((value) => String(value))
                              : [];

                            const nextRoleIds = isChecked
                              ? Array.from(new Set([...current, roleId]))
                              : current.filter((value) => value !== roleId);

                            return {
                              ...previous,
                              draft: { ...previous.draft, role_ids: nextRoleIds },
                            };
                          });
                        }}
                      />
                    );
                  })}
                </div>
              )}
              <Form.Text className="text-muted">
                {scopedRoles.length === 0
                  ? "No roles available for assignment."
                  : "Select one or more roles for this card."}
              </Form.Text>
            </Form.Group>

            <Form.Check
              type="switch"
              label="Active"
              checked={Boolean(cardModal.draft.is_active)}
              onChange={(event) =>
                setCardModal((previous) => ({
                  ...previous,
                  draft: { ...previous.draft, is_active: event.target.checked },
                }))
              }
            />
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline-secondary" onClick={closeCardModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : cardModal.mode === "create" ? "Add Card" : "Save Changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
