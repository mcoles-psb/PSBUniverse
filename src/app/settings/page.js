"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  Modal,
  Nav,
  Row,
  Spinner,
  Tab,
  Table,
  Tabs,
} from "react-bootstrap";
import { AUTH_CHANGE_EVENT, getStoredUser } from "@/lib/localAuth";

function isActiveValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function fullName(user) {
  return [user.first_name, user.middle_name, user.last_name]
    .filter((part) => String(part ?? "").trim().length > 0)
    .join(" ") || "-";
}

function getDefaultUserRoleId(roles) {
  const userRole = roles.find(
    (role) => String(role.role_name ?? "").trim().toLowerCase() === "user"
  );
  if (userRole) return String(userRole.role_id);
  return roles[0] ? String(roles[0].role_id) : "";
}

function getDefaultAppId(apps) {
  return apps[0] ? String(apps[0].app_id) : "";
}

function createUserDraft(user) {
  return {
    firstName: user.first_name ?? "",
    middleName: user.middle_name ?? "",
    lastName: user.last_name ?? "",
    address: user.address ?? "",
    username: user.username ?? "",
    email: user.email ?? "",
    password: "",
    isActive: isActiveValue(user.is_active),
  };
}

function createEmptyNewUserDraft() {
  return {
    firstName: "",
    middleName: "",
    lastName: "",
    address: "",
    username: "",
    email: "",
    password: "",
    isActive: true,
  };
}

function createEmptyNewMasterDraft() {
  return {
    firstName: "",
    middleName: "",
    lastName: "",
    address: "",
  };
}

function createCompanyDraft(company) {
  return {
    compId: company?.comp_id ?? null,
    compName: company?.comp_name ?? "",
    shortName: company?.short_name ?? "",
    compEmail: company?.comp_email ?? "",
    compPhone: company?.comp_phone ?? "",
    isActive: isActiveValue(company?.is_active ?? true),
  };
}

function createEmptyNewCompanyDraft() {
  return {
    compName: "",
    shortName: "",
    compEmail: "",
    compPhone: "",
    isActive: true,
  };
}

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [apps, setApps] = useState([]);
  const [userDrafts, setUserDrafts] = useState({});
  const [accessDrafts, setAccessDrafts] = useState({});
  const [newMasterDraft, setNewMasterDraft] = useState(() => createEmptyNewMasterDraft());
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newAccessByUser, setNewAccessByUser] = useState({});
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [activeTabByUser, setActiveTabByUser] = useState({});
  const [activeMasterTab, setActiveMasterTab] = useState("user-master");
  const [companies, setCompanies] = useState([]);
  const [companyDrafts, setCompanyDrafts] = useState({});
  const [companyEditById, setCompanyEditById] = useState({});
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyDraft, setNewCompanyDraft] = useState(() => createEmptyNewCompanyDraft());
  const [employeeEditByUser, setEmployeeEditByUser] = useState({});
  const [accountEditByUser, setAccountEditByUser] = useState({});
  const [accessEditByUser, setAccessEditByUser] = useState({});
  const [accessAddModalUserId, setAccessAddModalUserId] = useState(null);

  useEffect(() => {
    function syncUser() {
      setCurrentUser(getStoredUser());
    }

    window.addEventListener("storage", syncUser);
    window.addEventListener(AUTH_CHANGE_EVENT, syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener(AUTH_CHANGE_EVENT, syncUser);
    };
  }, []);

  useEffect(() => {
    async function loadSettings() {
      if (!currentUser?.isDevMain || !currentUser?.userId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      try {
        const response = await fetch(
          `/api/admin/users?actorUserId=${encodeURIComponent(currentUser.userId)}`,
          { method: "GET" }
        );
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setErrorMessage(payload?.error || "Unable to load settings data.");
          setLoading(false);
          return;
        }

        const nextUsers = payload?.users ?? [];
        const nextAccess = payload?.accessRows ?? [];
        const nextRoles = payload?.roles ?? [];
        const nextApps = payload?.apps ?? [];
        const nextCompanies = payload?.companies ?? [];
        const defaultRoleId = getDefaultUserRoleId(nextRoles);
        const defaultAppId = getDefaultAppId(nextApps);

        setUsers(nextUsers);
        setAccessRows(nextAccess);
        setRoles(nextRoles);
        setApps(nextApps);

        const initialUserDrafts = {};
        for (const user of nextUsers) {
          initialUserDrafts[user.user_id] = createUserDraft(user);
        }
        setUserDrafts(initialUserDrafts);

        const initialAccessDrafts = {};
        for (const row of nextAccess) {
          initialAccessDrafts[row.uar_id] = {
            appId: String(row.app_id ?? ""),
            roleId: String(row.role_id ?? ""),
            isActive: isActiveValue(row.is_active),
          };
        }
        setAccessDrafts(initialAccessDrafts);

        const initialNewAccessByUser = {};
        for (const user of nextUsers) {
          initialNewAccessByUser[user.user_id] = {
            appId: defaultAppId,
            roleId: defaultRoleId,
            isActive: true,
          };
        }
        setNewAccessByUser(initialNewAccessByUser);

        setCompanies(nextCompanies);

        const initialCompanyDrafts = {};
        for (const company of nextCompanies) {
          initialCompanyDrafts[company.comp_id] = createCompanyDraft(company);
        }
        setCompanyDrafts(initialCompanyDrafts);
        setCompanyEditById({});
      } catch (_error) {
        setErrorMessage("Unable to load settings data right now.");
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [currentUser]);

  const roleNameById = useMemo(() => {
    return Object.fromEntries(roles.map((role) => [String(role.role_id), role.role_name]));
  }, [roles]);

  const appNameById = useMemo(() => {
    return Object.fromEntries(apps.map((app) => [String(app.app_id), app.app_name]));
  }, [apps]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((left, right) => Number(left.user_id) - Number(right.user_id));
  }, [users]);

  const selectedAccessUser = useMemo(() => {
    if (accessAddModalUserId === null) return null;
    return (
      sortedUsers.find((user) => Number(user.user_id) === Number(accessAddModalUserId)) ?? null
    );
  }, [sortedUsers, accessAddModalUserId]);

  const accessByUserId = useMemo(() => {
    const map = new Map();

    for (const row of accessRows) {
      const userId = Number(row.user_id);
      const existing = map.get(userId) ?? [];
      existing.push(row);
      map.set(userId, existing);
    }

    for (const [userId, rows] of map.entries()) {
      rows.sort((left, right) => {
        const leftApp = appNameById[String(left.app_id)] || "";
        const rightApp = appNameById[String(right.app_id)] || "";
        const appComparison = leftApp.localeCompare(rightApp);
        if (appComparison !== 0) return appComparison;
        return Number(left.uar_id) - Number(right.uar_id);
      });
      map.set(userId, rows);
    }

    return map;
  }, [accessRows, appNameById]);

  function setUserDraft(userId, patch) {
    setUserDrafts((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? createEmptyNewUserDraft()),
        ...patch,
      },
    }));
  }

  function setAccessDraft(uarId, patch) {
    setAccessDrafts((prev) => ({
      ...prev,
      [uarId]: {
        ...(prev[uarId] ?? { appId: "", roleId: "", isActive: true }),
        ...patch,
      },
    }));
  }

  function setNewAccessDraftForUser(userId, patch) {
    const defaultRoleId = getDefaultUserRoleId(roles);
    const defaultAppId = getDefaultAppId(apps);

    setNewAccessByUser((prev) => ({
      ...prev,
      [userId]: {
        appId: defaultAppId,
        roleId: defaultRoleId,
        isActive: true,
        ...(prev[userId] ?? {}),
        ...patch,
      },
    }));
  }

  function setCompanyDraftForId(compId, patch) {
    setCompanyDrafts((prev) => ({
      ...prev,
      [compId]: {
        ...(prev[compId] ?? createCompanyDraft(null)),
        ...patch,
      },
    }));
  }

  async function sendPatch(body) {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actorUserId: currentUser.userId,
        ...body,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || "Request failed.");
    }

    return payload;
  }

  async function handleCreateUser() {
    if (!newMasterDraft.firstName.trim() || !newMasterDraft.lastName.trim()) {
      setErrorMessage("First name and last name are required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = await sendPatch({
        action: "create-user-master",
        firstName: newMasterDraft.firstName,
        middleName: newMasterDraft.middleName,
        lastName: newMasterDraft.lastName,
        address: newMasterDraft.address,
      });

      const createdUser = payload.user;
      if (!createdUser) {
        throw new Error("User created but no user payload was returned.");
      }

      setUsers((prev) => [...prev, createdUser]);
      setUserDrafts((prev) => ({
        ...prev,
        [createdUser.user_id]: createUserDraft(createdUser),
      }));
      setNewAccessDraftForUser(createdUser.user_id, {});

      setExpandedUserId(createdUser.user_id);
      setActiveTabByUser((prev) => ({ ...prev, [createdUser.user_id]: "employee" }));

      setNewMasterDraft(createEmptyNewMasterDraft());
      setShowAddUserModal(false);
      setSuccessMessage(`Created user ${fullName(createdUser)}.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEmployeeDetails(userId) {
    const draft = userDrafts[userId] ?? createEmptyNewUserDraft();

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = await sendPatch({
        action: "update-user-master-detail",
        userId,
        firstName: draft.firstName,
        middleName: draft.middleName,
        lastName: draft.lastName,
        address: draft.address,
      });

      const updatedUser = payload.user;
      if (!updatedUser) {
        throw new Error("User updated but no user payload was returned.");
      }

      setUsers((prev) =>
        prev.map((row) => (Number(row.user_id) === Number(userId) ? updatedUser : row))
      );
      setUserDrafts((prev) => ({
        ...prev,
        [userId]: createUserDraft(updatedUser),
      }));
      setEmployeeEditByUser((prev) => ({ ...prev, [userId]: false }));

      setSuccessMessage(`Saved employee details for user ${updatedUser.user_id}.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAccountDetails(userId) {
    const draft = userDrafts[userId] ?? createEmptyNewUserDraft();

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = await sendPatch({
        action: "update-user-master-detail",
        userId,
        username: draft.username,
        email: draft.email,
        password: draft.password,
        isActive: draft.isActive,
      });

      const updatedUser = payload.user;
      if (!updatedUser) {
        throw new Error("User updated but no user payload was returned.");
      }

      setUsers((prev) =>
        prev.map((row) => (Number(row.user_id) === Number(userId) ? updatedUser : row))
      );
      setUserDrafts((prev) => ({
        ...prev,
        [userId]: createUserDraft(updatedUser),
      }));
      setAccountEditByUser((prev) => ({ ...prev, [userId]: false }));

      setSuccessMessage(`Saved account details for ${updatedUser.username || updatedUser.user_id}.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCompanyMaster() {
    if (!newCompanyDraft.compName.trim()) {
      setErrorMessage("Company name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = await sendPatch({
        action: "create-company-master",
        compName: newCompanyDraft.compName,
        shortName: newCompanyDraft.shortName,
        compEmail: newCompanyDraft.compEmail,
        compPhone: newCompanyDraft.compPhone,
        isActive: newCompanyDraft.isActive,
      });

      const createdCompany = payload?.company;
      if (!createdCompany?.comp_id) {
        throw new Error("Company created but no company payload was returned.");
      }

      setCompanies((prev) => [...prev, createdCompany]);
      setCompanyDrafts((prev) => ({
        ...prev,
        [createdCompany.comp_id]: createCompanyDraft(createdCompany),
      }));
      setShowAddCompanyModal(false);
      setNewCompanyDraft(createEmptyNewCompanyDraft());
      setSuccessMessage("Company created.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleCompanyEdit(compId, company) {
    const next = !Boolean(companyEditById[compId]);
    setCompanyEditById((prev) => ({ ...prev, [compId]: next }));

    if (next) {
      setCompanyDrafts((prev) => ({
        ...prev,
        [compId]: createCompanyDraft(company),
      }));
    }
  }

  function cancelCompanyEdit(compId, company) {
    setCompanyDrafts((prev) => ({
      ...prev,
      [compId]: createCompanyDraft(company),
    }));
    setCompanyEditById((prev) => ({ ...prev, [compId]: false }));
  }

  async function handleSaveCompanyMaster(compId) {
    const draft = companyDrafts[compId] ?? createCompanyDraft(null);
    if (!draft.compName.trim()) {
      setErrorMessage("Company name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = await sendPatch({
        action: "update-company-master",
        compId,
        compName: draft.compName,
        shortName: draft.shortName,
        compEmail: draft.compEmail,
        compPhone: draft.compPhone,
        isActive: draft.isActive,
      });

      const updatedCompany = payload?.company;
      if (!updatedCompany?.comp_id) {
        throw new Error("Company updated but no company payload was returned.");
      }

      setCompanies((prev) =>
        prev.map((row) =>
          Number(row.comp_id) === Number(compId) ? updatedCompany : row
        )
      );
      setCompanyDrafts((prev) => ({
        ...prev,
        [compId]: createCompanyDraft(updatedCompany),
      }));
      setCompanyEditById((prev) => ({ ...prev, [compId]: false }));
      setSuccessMessage("Company details saved.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCompanyMaster(compId) {
    if (!window.confirm("Delete this company record?")) return;

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await sendPatch({
        action: "delete-company-master",
        compId,
      });

      setCompanies((prev) =>
        prev.filter((row) => Number(row.comp_id) !== Number(compId))
      );
      setCompanyDrafts((prev) => {
        const next = { ...prev };
        delete next[compId];
        return next;
      });
      setCompanyEditById((prev) => {
        const next = { ...prev };
        delete next[compId];
        return next;
      });
      setSuccessMessage("Company deleted.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAccessForUser(userId) {
    if (!userId) return;

    const draft = newAccessByUser[userId];
    if (!draft?.appId || !draft?.roleId) {
      setErrorMessage("Select app and role before adding access.");
      return;
    }

    const selectedAppId = Number(draft.appId);
    const roleIdForRequest = Number(draft.roleId);

    if (!roleIdForRequest) {
      setErrorMessage("Select a role before adding access.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = await sendPatch({
        action: "upsert-access",
        userId: Number(userId),
        roleId: roleIdForRequest,
        appId: selectedAppId,
        isActive: draft.isActive,
      });

      const updatedRow = payload.accessRow;
      const exists = accessRows.some(
        (row) => Number(row.uar_id) === Number(updatedRow?.uar_id)
      );

      if (exists) {
        setAccessRows((prev) =>
          prev.map((row) =>
            Number(row.uar_id) === Number(updatedRow.uar_id) ? updatedRow : row
          )
        );
      } else {
        setAccessRows((prev) => [...prev, updatedRow]);
      }

      setAccessDrafts((prev) => ({
        ...prev,
        [updatedRow.uar_id]: {
          appId: String(updatedRow.app_id),
          roleId: String(updatedRow.role_id),
          isActive: isActiveValue(updatedRow.is_active),
        },
      }));

      setSuccessMessage("App permission added.");
      setAccessAddModalUserId(null);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAllAccessForUser(userId) {
    const rowsForUser = accessRows.filter(
      (row) => Number(row.user_id) === Number(userId)
    );

    if (rowsForUser.length === 0) {
      setAccessEditByUser((prev) => ({ ...prev, [userId]: false }));
      setSuccessMessage("No permissions to save.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const savedRows = [];

      for (const row of rowsForUser) {
        const draft = accessDrafts[row.uar_id] ?? {
          appId: String(row.app_id),
          roleId: String(row.role_id),
          isActive: isActiveValue(row.is_active),
        };

        const appId = Number(draft.appId);
        const roleId = Number(draft.roleId);

        if (!appId || !roleId) {
          throw new Error("Each permission needs an app and role before saving.");
        }

        const payload = await sendPatch({
          action: "upsert-access",
          uarId: Number(row.uar_id),
          userId: Number(row.user_id),
          roleId,
          appId,
          isActive: draft.isActive,
        });

        if (payload?.accessRow) {
          savedRows.push(payload.accessRow);
        }
      }

      const savedMap = new Map(
        savedRows.map((savedRow) => [Number(savedRow.uar_id), savedRow])
      );

      setAccessRows((prev) =>
        prev.map((row) => savedMap.get(Number(row.uar_id)) ?? row)
      );

      setAccessDrafts((prev) => {
        const next = { ...prev };
        for (const savedRow of savedRows) {
          next[savedRow.uar_id] = {
            appId: String(savedRow.app_id),
            roleId: String(savedRow.role_id),
            isActive: isActiveValue(savedRow.is_active),
          };
        }
        return next;
      });

      setAccessEditByUser((prev) => ({ ...prev, [userId]: false }));
      setSuccessMessage("Permissions saved.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleExpand(userId) {
    if (Number(expandedUserId) === Number(userId)) {
      setExpandedUserId(null);
      return;
    }

    setExpandedUserId(userId);
    setActiveTabByUser((prev) => ({ ...prev, [userId]: prev[userId] || "employee" }));
  }

  function toggleEmployeeEdit(userId, user) {
    const nextValue = !Boolean(employeeEditByUser[userId]);
    setEmployeeEditByUser((prev) => ({ ...prev, [userId]: nextValue }));

    if (nextValue) {
      setUserDrafts((prev) => ({
        ...prev,
        [userId]: createUserDraft(user),
      }));
    }
  }

  function cancelEmployeeEdit(userId, user) {
    setUserDrafts((prev) => ({
      ...prev,
      [userId]: createUserDraft(user),
    }));
    setEmployeeEditByUser((prev) => ({ ...prev, [userId]: false }));
  }

  function toggleAccountEdit(userId, user) {
    const nextValue = !Boolean(accountEditByUser[userId]);
    setAccountEditByUser((prev) => ({ ...prev, [userId]: nextValue }));

    if (nextValue) {
      setUserDrafts((prev) => ({
        ...prev,
        [userId]: createUserDraft(user),
      }));
    }
  }

  function cancelAccountEdit(userId, user) {
    setUserDrafts((prev) => ({
      ...prev,
      [userId]: createUserDraft(user),
    }));
    setAccountEditByUser((prev) => ({ ...prev, [userId]: false }));
  }

  function toggleAccessEdit(userId) {
    setAccessEditByUser((prev) => ({ ...prev, [userId]: !Boolean(prev[userId]) }));
  }

  function openAccessAddModal(userId) {
    setNewAccessDraftForUser(userId, {});
    setAccessAddModalUserId(userId);
  }

  if (loading) {
    return (
      <Container className="py-4">
        <Card className="profile-card">
          <Card.Body className="d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" />
            Loading settings...
          </Card.Body>
        </Card>
      </Container>
    );
  }

  if (!currentUser?.isDevMain) {
    return (
      <Container className="py-4" style={{ maxWidth: 860 }}>
        <Card className="profile-card">
          <Card.Body>
            <h1 className="profile-card-title mb-2">User and Access Management</h1>
            <p className="mb-0 text-muted">
              Access restricted. Please contact your administrator if you need access.
            </p>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: 1280 }}>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <p className="profile-section-label mb-1">Settings</p>
          <h1 className="profile-card-title mb-0">Advanced User and Access Management</h1>
        </div>
      </div>

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}

      <Nav variant="tabs" className="mb-3">
        <Nav.Item>
          <Nav.Link
            active={activeMasterTab === "user-master"}
            onClick={() => setActiveMasterTab("user-master")}
          >
            User Master
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link
            active={activeMasterTab === "company-master"}
            onClick={() => setActiveMasterTab("company-master")}
          >
            Company Master
          </Nav.Link>
        </Nav.Item>
      </Nav>

      {activeMasterTab === "user-master" ? (
        <>

      <Card className="profile-card mb-3">
        <Card.Body>
          <h2 className="h5 mb-2">Add Employee</h2>
          <p className="text-muted mb-3" style={{ fontSize: "0.9rem" }}>
            Add the employee profile first. Then open the row to update profile,
            portal account, and app permissions.
          </p>
          <Button onClick={() => setShowAddUserModal(true)} disabled={saving}>
            Add Employee
          </Button>
        </Card.Body>
      </Card>

      <Card className="profile-card">
        <Card.Body>
          <h2 className="h5 mb-2">Employees</h2>
          <p className="text-muted mb-3" style={{ fontSize: "0.9rem" }}>
            Open a row to manage employee profile, portal account, and app permissions.
          </p>

          <Table responsive bordered className="align-middle mb-0">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => {
                const userDraft = userDrafts[user.user_id] ?? createUserDraft(user);
                const isExpanded = Number(expandedUserId) === Number(user.user_id);
                const userAccessRows = accessByUserId.get(Number(user.user_id)) ?? [];
                const isEmployeeEditing = Boolean(employeeEditByUser[user.user_id]);
                const isAccountEditing = Boolean(accountEditByUser[user.user_id]);
                const isAccessEditing = Boolean(accessEditByUser[user.user_id]);
                const isAccessAdding =
                  accessAddModalUserId !== null &&
                  Number(accessAddModalUserId) === Number(user.user_id);
                const newAccessDraft =
                  newAccessByUser[user.user_id] ?? {
                    appId: getDefaultAppId(apps),
                    roleId: getDefaultUserRoleId(roles),
                    isActive: true,
                  };

                return (
                  <>
                    <tr
                      key={`user-row-${user.user_id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleExpand(user.user_id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleExpand(user.user_id);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{user.user_id}</td>
                      <td>{fullName(user)}</td>
                      <td>{user.username || "-"}</td>
                      <td>{user.email || "-"}</td>
                      <td>{isActiveValue(user.is_active) ? "Active" : "Inactive"}</td>
                    </tr>

                    {isExpanded ? (
                      <tr key={`user-expanded-${user.user_id}`}>
                        <td colSpan={5}>
                          <Tabs
                            activeKey={activeTabByUser[user.user_id] || "employee"}
                            onSelect={(key) =>
                              setActiveTabByUser((prev) => ({
                                ...prev,
                                [user.user_id]: key || "employee",
                              }))
                            }
                            className="mb-3"
                          >
                            <Tab eventKey="employee" title="Employee Profile">
                              <div className="d-flex justify-content-end gap-2 mb-2">
                                {isEmployeeEditing ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline-secondary"
                                      disabled={saving}
                                      onClick={() => cancelEmployeeEdit(user.user_id, user)}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={saving}
                                      onClick={() => handleSaveEmployeeDetails(user.user_id)}
                                    >
                                      Save
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline-primary"
                                    disabled={saving}
                                    onClick={() => toggleEmployeeEdit(user.user_id, user)}
                                  >
                                    Edit
                                  </Button>
                                )}
                              </div>

                              <Row className="g-2 align-items-end">
                                <Col md={3}>
                                  <Form.Label className="mb-1">First Name</Form.Label>
                                  <Form.Control
                                    disabled={!isEmployeeEditing}
                                    value={userDraft.firstName}
                                    onChange={(event) =>
                                      setUserDraft(user.user_id, { firstName: event.target.value })
                                    }
                                  />
                                </Col>
                                <Col md={2}>
                                  <Form.Label className="mb-1">Middle</Form.Label>
                                  <Form.Control
                                    disabled={!isEmployeeEditing}
                                    value={userDraft.middleName}
                                    onChange={(event) =>
                                      setUserDraft(user.user_id, { middleName: event.target.value })
                                    }
                                  />
                                </Col>
                                <Col md={3}>
                                  <Form.Label className="mb-1">Last Name</Form.Label>
                                  <Form.Control
                                    disabled={!isEmployeeEditing}
                                    value={userDraft.lastName}
                                    onChange={(event) =>
                                      setUserDraft(user.user_id, { lastName: event.target.value })
                                    }
                                  />
                                </Col>
                                <Col md={4}>
                                  <Form.Label className="mb-1">Address</Form.Label>
                                  <Form.Control
                                    disabled={!isEmployeeEditing}
                                    value={userDraft.address}
                                    onChange={(event) =>
                                      setUserDraft(user.user_id, { address: event.target.value })
                                    }
                                  />
                                </Col>
                              </Row>
                            </Tab>

                            <Tab eventKey="account" title="Portal Account">
                              <div className="d-flex justify-content-end gap-2 mb-2">
                                {isAccountEditing ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline-secondary"
                                      disabled={saving}
                                      onClick={() => cancelAccountEdit(user.user_id, user)}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={saving}
                                      onClick={() => handleSaveAccountDetails(user.user_id)}
                                    >
                                      Save
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline-primary"
                                    disabled={saving}
                                    onClick={() => toggleAccountEdit(user.user_id, user)}
                                  >
                                    Edit
                                  </Button>
                                )}
                              </div>

                              <Row className="g-2 align-items-end">
                                <Col md={3}>
                                  <Form.Label className="mb-1">Username</Form.Label>
                                  <Form.Control
                                    disabled={!isAccountEditing}
                                    value={userDraft.username}
                                    onChange={(event) =>
                                      setUserDraft(user.user_id, { username: event.target.value })
                                    }
                                  />
                                </Col>
                                <Col md={3}>
                                  <Form.Label className="mb-1">Email</Form.Label>
                                  <Form.Control
                                    disabled={!isAccountEditing}
                                    value={userDraft.email}
                                    onChange={(event) =>
                                      setUserDraft(user.user_id, { email: event.target.value })
                                    }
                                  />
                                </Col>
                                <Col md={3}>
                                  <Form.Label className="mb-1">New Password</Form.Label>
                                  <Form.Control
                                    disabled={!isAccountEditing}
                                    type="text"
                                    value={userDraft.password}
                                    placeholder="Leave blank to keep"
                                    onChange={(event) =>
                                      setUserDraft(user.user_id, { password: event.target.value })
                                    }
                                  />
                                </Col>
                                <Col md={2}>
                                  <Form.Check
                                    disabled={!isAccountEditing}
                                    type="switch"
                                    label={userDraft.isActive ? "Active" : "Inactive"}
                                    checked={Boolean(userDraft.isActive)}
                                    onChange={(event) =>
                                      setUserDraft(user.user_id, {
                                        isActive: event.target.checked,
                                      })
                                    }
                                  />
                                </Col>
                                <Col md={1} className="d-grid" />
                              </Row>
                            </Tab>

                              <Tab eventKey="access" title="App Permissions">
                                <div className="d-flex justify-content-end gap-2 mb-2">
                                  <Button
                                    size="sm"
                                    variant={isAccessEditing ? "primary" : "outline-primary"}
                                    disabled={saving}
                                    onClick={() => toggleAccessEdit(user.user_id)}
                                  >
                                    {isAccessEditing ? "Editing" : "Edit"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={isAccessAdding ? "primary" : "outline-primary"}
                                    disabled={saving}
                                    onClick={() => openAccessAddModal(user.user_id)}
                                  >
                                    Add
                                  </Button>
                                  {isAccessEditing ? (
                                    <Button
                                      size="sm"
                                      disabled={saving}
                                      onClick={() => handleSaveAllAccessForUser(user.user_id)}
                                    >
                                      Save
                                    </Button>
                                  ) : null}
                                </div>

                                <Table responsive className="align-middle mb-2">
                                  <thead>
                                    <tr>
                                      <th>App</th>
                                      <th>Role</th>
                                      <th>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {userAccessRows.length === 0 ? (
                                      <tr>
                                        <td colSpan={3} className="text-muted text-center py-2">
                                          No app permissions found for this user.
                                        </td>
                                      </tr>
                                    ) : null}

                                    {userAccessRows.map((row) => {
                                      const accessDraft = accessDrafts[row.uar_id] ?? {
                                        appId: String(row.app_id),
                                        roleId: String(row.role_id),
                                        isActive: isActiveValue(row.is_active),
                                      };

                                      return (
                                        <tr key={`role-access-${row.uar_id}`}>
                                          <td style={{ minWidth: 220 }}>
                                            <Form.Select
                                              disabled={!isAccessEditing}
                                              value={accessDraft.appId}
                                              onChange={(event) =>
                                                setAccessDraft(row.uar_id, {
                                                  appId: event.target.value,
                                                })
                                              }
                                            >
                                              {apps.map((app) => (
                                                <option key={app.app_id} value={String(app.app_id)}>
                                                  {app.app_name}
                                                </option>
                                              ))}
                                            </Form.Select>
                                          </td>
                                          <td style={{ minWidth: 180 }}>
                                            <Form.Select
                                              disabled={!isAccessEditing}
                                              value={accessDraft.roleId}
                                              onChange={(event) =>
                                                setAccessDraft(row.uar_id, {
                                                  roleId: event.target.value,
                                                })
                                              }
                                            >
                                              {roles.map((role) => (
                                                <option key={role.role_id} value={String(role.role_id)}>
                                                  {role.role_name}
                                                </option>
                                              ))}
                                            </Form.Select>
                                          </td>
                                          <td>
                                            <Form.Check
                                              disabled={!isAccessEditing}
                                              type="switch"
                                              label={accessDraft.isActive ? "Active" : "Inactive"}
                                              checked={Boolean(accessDraft.isActive)}
                                              onChange={(event) =>
                                                setAccessDraft(row.uar_id, {
                                                  isActive: event.target.checked,
                                                })
                                              }
                                            />
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </Table>
                            </Tab>
                          </Tabs>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </Table>

          <p className="text-muted mt-3 mb-0" style={{ fontSize: "0.88rem" }}>
            This is an advanced user and access management screen for authorized users.
          </p>
        </Card.Body>
      </Card>
        </>
      ) : (
        <Card className="profile-card mb-3">
          <Card.Body>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h2 className="h5 mb-0">Company Master</h2>
              <Button size="sm" disabled={saving} onClick={() => setShowAddCompanyModal(true)}>
                Add Company
              </Button>
            </div>
            <p className="text-muted mb-3" style={{ fontSize: "0.9rem" }}>
              Create, edit, and remove company records used across the portal.
            </p>

            <Table responsive bordered className="align-middle mb-0">
              <thead>
                <tr>
                  <th>Company ID</th>
                  <th>Company Name</th>
                  <th>Short Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-muted text-center py-2">
                      No company records found.
                    </td>
                  </tr>
                ) : null}

                {companies.map((company) => {
                  const draft = companyDrafts[company.comp_id] ?? createCompanyDraft(company);
                  const isEditing = Boolean(companyEditById[company.comp_id]);

                  return (
                    <tr key={`company-${company.comp_id}`}>
                      <td>{company.comp_id}</td>
                      <td style={{ minWidth: 220 }}>
                        <Form.Control
                          disabled={!isEditing}
                          value={draft.compName}
                          onChange={(event) =>
                            setCompanyDraftForId(company.comp_id, {
                              compName: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td style={{ minWidth: 160 }}>
                        <Form.Control
                          disabled={!isEditing}
                          value={draft.shortName}
                          onChange={(event) =>
                            setCompanyDraftForId(company.comp_id, {
                              shortName: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td style={{ minWidth: 240 }}>
                        <Form.Control
                          disabled={!isEditing}
                          value={draft.compEmail}
                          onChange={(event) =>
                            setCompanyDraftForId(company.comp_id, {
                              compEmail: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <Form.Control
                          disabled={!isEditing}
                          value={draft.compPhone}
                          onChange={(event) =>
                            setCompanyDraftForId(company.comp_id, {
                              compPhone: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <Form.Check
                          disabled={!isEditing}
                          type="switch"
                          label={draft.isActive ? "Active" : "Inactive"}
                          checked={Boolean(draft.isActive)}
                          onChange={(event) =>
                            setCompanyDraftForId(company.comp_id, {
                              isActive: event.target.checked,
                            })
                          }
                        />
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline-secondary"
                                disabled={saving}
                                onClick={() => cancelCompanyEdit(company.comp_id, company)}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                disabled={saving}
                                onClick={() => handleSaveCompanyMaster(company.comp_id)}
                              >
                                Save
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline-primary"
                                disabled={saving}
                                onClick={() => toggleCompanyEdit(company.comp_id, company)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-danger"
                                disabled={saving}
                                onClick={() => handleDeleteCompanyMaster(company.comp_id)}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      <Modal show={showAddCompanyModal} onHide={() => setShowAddCompanyModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add Company</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-2">
            <Col md={12}>
              <Form.Label className="mb-1">Company Name</Form.Label>
              <Form.Control
                value={newCompanyDraft.compName}
                onChange={(event) =>
                  setNewCompanyDraft((prev) => ({ ...prev, compName: event.target.value }))
                }
              />
            </Col>
            <Col md={12}>
              <Form.Label className="mb-1">Short Name</Form.Label>
              <Form.Control
                value={newCompanyDraft.shortName}
                onChange={(event) =>
                  setNewCompanyDraft((prev) => ({ ...prev, shortName: event.target.value }))
                }
              />
            </Col>
            <Col md={12}>
              <Form.Label className="mb-1">Email</Form.Label>
              <Form.Control
                value={newCompanyDraft.compEmail}
                onChange={(event) =>
                  setNewCompanyDraft((prev) => ({ ...prev, compEmail: event.target.value }))
                }
              />
            </Col>
            <Col md={12}>
              <Form.Label className="mb-1">Phone</Form.Label>
              <Form.Control
                value={newCompanyDraft.compPhone}
                onChange={(event) =>
                  setNewCompanyDraft((prev) => ({ ...prev, compPhone: event.target.value }))
                }
              />
            </Col>
            <Col md={12}>
              <Form.Check
                type="switch"
                label={newCompanyDraft.isActive ? "Active" : "Inactive"}
                checked={Boolean(newCompanyDraft.isActive)}
                onChange={(event) =>
                  setNewCompanyDraft((prev) => ({ ...prev, isActive: event.target.checked }))
                }
              />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowAddCompanyModal(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={handleCreateCompanyMaster}>
            Save Company
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showAddUserModal} onHide={() => setShowAddUserModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add Employee</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-2">
            <Col md={6}>
              <Form.Label className="mb-1">First Name</Form.Label>
              <Form.Control
                value={newMasterDraft.firstName}
                onChange={(event) =>
                  setNewMasterDraft((prev) => ({ ...prev, firstName: event.target.value }))
                }
                placeholder="First"
              />
            </Col>
            <Col md={6}>
              <Form.Label className="mb-1">Middle Name</Form.Label>
              <Form.Control
                value={newMasterDraft.middleName}
                onChange={(event) =>
                  setNewMasterDraft((prev) => ({ ...prev, middleName: event.target.value }))
                }
                placeholder="Middle"
              />
            </Col>
            <Col md={6}>
              <Form.Label className="mb-1">Last Name</Form.Label>
              <Form.Control
                value={newMasterDraft.lastName}
                onChange={(event) =>
                  setNewMasterDraft((prev) => ({ ...prev, lastName: event.target.value }))
                }
                placeholder="Last"
              />
            </Col>
            <Col md={6}>
              <Form.Label className="mb-1">Address</Form.Label>
              <Form.Control
                value={newMasterDraft.address}
                onChange={(event) =>
                  setNewMasterDraft((prev) => ({ ...prev, address: event.target.value }))
                }
                placeholder="Address"
              />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowAddUserModal(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={handleCreateUser}>
            Save Employee
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={accessAddModalUserId !== null}
        onHide={() => setAccessAddModalUserId(null)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Add App Permission {selectedAccessUser ? `for ${fullName(selectedAccessUser)}` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {accessAddModalUserId !== null ? (
            <Row className="g-2">
              <Col md={12}>
                <Form.Label className="mb-1">App</Form.Label>
                <Form.Select
                  value={newAccessByUser[accessAddModalUserId]?.appId || ""}
                  onChange={(event) =>
                    setNewAccessDraftForUser(accessAddModalUserId, {
                      appId: event.target.value,
                    })
                  }
                >
                  <option value="">Select app</option>
                  {apps.map((app) => (
                    <option key={app.app_id} value={String(app.app_id)}>
                      {app.app_name}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={12}>
                <Form.Label className="mb-1">Role</Form.Label>
                <Form.Select
                  value={newAccessByUser[accessAddModalUserId]?.roleId || ""}
                  onChange={(event) =>
                    setNewAccessDraftForUser(accessAddModalUserId, {
                      roleId: event.target.value,
                    })
                  }
                >
                  <option value="">Select role</option>
                  {roles.map((role) => (
                    <option key={role.role_id} value={String(role.role_id)}>
                      {role.role_name}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={12}>
                <Form.Check
                  type="switch"
                  label={newAccessByUser[accessAddModalUserId]?.isActive ? "Active" : "Inactive"}
                  checked={Boolean(newAccessByUser[accessAddModalUserId]?.isActive)}
                  onChange={(event) =>
                    setNewAccessDraftForUser(accessAddModalUserId, {
                      isActive: event.target.checked,
                    })
                  }
                />
              </Col>
            </Row>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setAccessAddModalUserId(null)}>
            Cancel
          </Button>
          <Button
            disabled={saving || accessAddModalUserId === null}
            onClick={() => handleAddAccessForUser(accessAddModalUserId)}
          >
            Add
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
