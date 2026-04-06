"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  Row,
  Table,
} from "react-bootstrap";
import {
  cacheReferenceData,
  clearSessionCache,
  getCachedJson,
  invalidateUserMasterCache,
  USER_MASTER_CACHE_KEYS,
  USER_MASTER_CACHE_TTL,
} from "@/modules/user-master/cache/user-master.cache";

const ADMIN_APP_KEY = "admin-config";

function getLabel(record, preferred = []) {
  const fields = [
    ...preferred,
    "name",
    "role_name",
    "app_name",
    "label",
    "code",
    "description",
  ];

  for (const field of fields) {
    const value = record?.[field];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "(Unnamed)";
}

function asSelectValue(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function toNullableNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function AdminUserMasterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [session, setSession] = useState(null);
  const [access, setAccess] = useState(null);

  const [references, setReferences] = useState({
    companies: [],
    departments: [],
    statuses: [],
    roles: [],
    applications: [],
  });

  const [users, setUsers] = useState([]);
  const [mappings, setMappings] = useState([]);

  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    comp_id: "",
    dept_id: "",
    status_id: "",
    is_active: true,
  });

  const [newRole, setNewRole] = useState({ name: "", code: "" });
  const [newApp, setNewApp] = useState({ name: "", code: "" });
  const [newMapping, setNewMapping] = useState({
    user_id: "",
    role_id: "",
    app_id: "",
  });

  const loadData = useCallback(async (options = {}) => {
    const forceFresh = Boolean(options.forceFresh);
    setLoading(true);
    setMessage("");

    try {
      const [sessionPayload, bootstrapPayload, usersPayload, mappingsPayload] =
        await Promise.all([
          getCachedJson({
            key: USER_MASTER_CACHE_KEYS.access(ADMIN_APP_KEY),
            url: `/api/user-master/session?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
            ttlMs: USER_MASTER_CACHE_TTL.accessMs,
            forceFresh,
            allowStaleOnError: false,
          }),
          getCachedJson({
            key: USER_MASTER_CACHE_KEYS.bootstrap,
            url: "/api/user-master/bootstrap",
            ttlMs: USER_MASTER_CACHE_TTL.refsMs,
            forceFresh,
            allowStaleOnError: true,
          }),
          getCachedJson({
            key: USER_MASTER_CACHE_KEYS.users,
            url: `/api/user-master/admin/users?appKey=${encodeURIComponent(ADMIN_APP_KEY)}&includeInactive=true`,
            ttlMs: USER_MASTER_CACHE_TTL.listsMs,
            forceFresh,
            allowStaleOnError: true,
          }),
          getCachedJson({
            key: USER_MASTER_CACHE_KEYS.mappings,
            url: `/api/user-master/admin/access-mappings?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
            ttlMs: USER_MASTER_CACHE_TTL.listsMs,
            forceFresh,
            allowStaleOnError: true,
          }),
        ]);

      setSession(sessionPayload.session || null);
      setAccess(sessionPayload.access || null);

      const refs = {
        companies: bootstrapPayload.companies || [],
        departments: bootstrapPayload.departments || [],
        statuses: bootstrapPayload.statuses || [],
        roles: bootstrapPayload.roles || [],
        applications: bootstrapPayload.applications || [],
      };

      setReferences(refs);
      cacheReferenceData(bootstrapPayload);

      setUsers(usersPayload.users || []);
      setMappings(mappingsPayload.mappings || []);
    } catch (error) {
      setMessage(error?.message || "Unable to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const departmentOptionsByCompany = useMemo(() => {
    return references.departments.reduce((map, department) => {
      const key = String(department.comp_id || "");
      if (!map[key]) map[key] = [];
      map[key].push(department);
      return map;
    }, {});
  }, [references.departments]);

  async function callApi(url, method, body) {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `${method} failed`);
    }
    return payload;
  }

  async function handleLogout() {
    setBusy(true);
    setMessage("");
    try {
      await callApi("/api/auth/logout", "POST");
      clearSessionCache(ADMIN_APP_KEY);
      router.push("/login");
    } catch (error) {
      setMessage(error?.message || "Logout failed");
    } finally {
      setBusy(false);
    }
  }

  async function createUser() {
    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/users?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
        "POST",
        {
          ...newUser,
          comp_id: toNullableNumber(newUser.comp_id),
          dept_id: toNullableNumber(newUser.dept_id),
          status_id: toNullableNumber(newUser.status_id),
        }
      );

      setNewUser({
        username: "",
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        comp_id: "",
        dept_id: "",
        status_id: "",
        is_active: true,
      });

      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.users,
        USER_MASTER_CACHE_KEYS.bootstrap,
      ]);
      setMessage("User created.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to create user");
    } finally {
      setBusy(false);
    }
  }

  async function saveUserRow(user) {
    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/users?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
        "PATCH",
        {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          address: user.address,
          comp_id: toNullableNumber(user.comp_id),
          dept_id: toNullableNumber(user.dept_id),
          status_id: toNullableNumber(user.status_id),
          is_active: Boolean(user.is_active),
        }
      );

      invalidateUserMasterCache([USER_MASTER_CACHE_KEYS.users]);
      setMessage("User updated.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to update user");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateUser(userId) {
    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/users?appKey=${encodeURIComponent(
          ADMIN_APP_KEY
        )}&user_id=${encodeURIComponent(userId)}`,
        "DELETE"
      );

      invalidateUserMasterCache([USER_MASTER_CACHE_KEYS.users]);
      setMessage("User deactivated.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to deactivate user");
    } finally {
      setBusy(false);
    }
  }

  async function createRole() {
    if (!newRole.name.trim()) {
      setMessage("Role name is required");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/roles?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
        "POST",
        { name: newRole.name, code: newRole.code || null }
      );

      setNewRole({ name: "", code: "" });
      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.bootstrap,
        USER_MASTER_CACHE_KEYS.mappings,
      ]);
      setMessage("Role created.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to create role");
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(role) {
    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/roles?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
        "PATCH",
        {
          role_id: role.role_id,
          name: role.name,
          role_name: role.role_name,
          code: role.code,
        }
      );

      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.bootstrap,
        USER_MASTER_CACHE_KEYS.mappings,
      ]);
      setMessage("Role updated.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to update role");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(roleId) {
    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/roles?appKey=${encodeURIComponent(
          ADMIN_APP_KEY
        )}&role_id=${encodeURIComponent(roleId)}`,
        "DELETE"
      );

      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.bootstrap,
        USER_MASTER_CACHE_KEYS.mappings,
      ]);
      setMessage("Role deleted.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to delete role");
    } finally {
      setBusy(false);
    }
  }

  async function createApplication() {
    if (!newApp.name.trim()) {
      setMessage("Application name is required");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/applications?appKey=${encodeURIComponent(
          ADMIN_APP_KEY
        )}`,
        "POST",
        { name: newApp.name, code: newApp.code || null }
      );

      setNewApp({ name: "", code: "" });
      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.bootstrap,
        USER_MASTER_CACHE_KEYS.mappings,
      ]);
      setMessage("Application created.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to create application");
    } finally {
      setBusy(false);
    }
  }

  async function updateApplication(app) {
    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/applications?appKey=${encodeURIComponent(
          ADMIN_APP_KEY
        )}`,
        "PATCH",
        {
          app_id: app.app_id,
          name: app.name,
          app_name: app.app_name,
          code: app.code,
        }
      );

      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.bootstrap,
        USER_MASTER_CACHE_KEYS.mappings,
      ]);
      setMessage("Application updated.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to update application");
    } finally {
      setBusy(false);
    }
  }

  async function deleteApplication(appId) {
    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/applications?appKey=${encodeURIComponent(
          ADMIN_APP_KEY
        )}&app_id=${encodeURIComponent(appId)}`,
        "DELETE"
      );

      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.bootstrap,
        USER_MASTER_CACHE_KEYS.mappings,
      ]);
      setMessage("Application deleted.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to delete application");
    } finally {
      setBusy(false);
    }
  }

  async function addMapping() {
    if (!newMapping.user_id || !newMapping.role_id || !newMapping.app_id) {
      setMessage("Select user, role, and application first.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/access-mappings?appKey=${encodeURIComponent(
          ADMIN_APP_KEY
        )}`,
        "POST",
        {
          user_id: toNullableNumber(newMapping.user_id),
          role_id: toNullableNumber(newMapping.role_id),
          app_id: toNullableNumber(newMapping.app_id),
        }
      );

      setNewMapping({ user_id: "", role_id: "", app_id: "" });
      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.mappings,
        USER_MASTER_CACHE_KEYS.access(ADMIN_APP_KEY),
      ]);
      setMessage("Access mapping saved.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to save mapping");
    } finally {
      setBusy(false);
    }
  }

  async function removeMapping(mapping) {
    setBusy(true);
    setMessage("");
    try {
      await callApi(
        `/api/user-master/admin/access-mappings?appKey=${encodeURIComponent(
          ADMIN_APP_KEY
        )}&user_id=${encodeURIComponent(mapping.user_id)}&role_id=${encodeURIComponent(
          mapping.role_id
        )}&app_id=${encodeURIComponent(mapping.app_id)}`,
        "DELETE"
      );

      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.mappings,
        USER_MASTER_CACHE_KEYS.access(ADMIN_APP_KEY),
      ]);
      setMessage("Access mapping removed.");
      await loadData({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to remove mapping");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Container className="py-4">Loading admin settings...</Container>;
  }

  if (access && !access.permissions?.read && !access.isDevMain) {
    return (
      <Container className="py-4" style={{ maxWidth: 980 }}>
        <Alert variant="danger">
          You do not have permission to access Admin Configuration for app key
          {" "}
          {ADMIN_APP_KEY}.
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: 1260 }}>
      <div className="d-flex align-items-center mb-3 justify-content-between">
        <div className="d-flex align-items-center">
          <Link href="/" className="back-link me-3">
            â† Back
          </Link>
          <div>
            <h2 className="mb-0">Devmain/Admin Configuration</h2>
            <p className="text-muted mb-0" style={{ fontSize: "0.86rem" }}>
              Manage users, roles, applications, and role mappings from User
              Master tables.
            </p>
          </div>
        </div>
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            onClick={() => loadData({ forceFresh: true })}
            disabled={busy}
          >
            Refresh
          </Button>
          <Button variant="outline-danger" onClick={handleLogout} disabled={busy}>
            Logout
          </Button>
        </div>
      </div>

      {message ? (
        <Alert variant={message.endsWith(".") ? "info" : "danger"}>{message}</Alert>
      ) : null}

      <Alert variant="light" className="border">
        <strong>Session User:</strong>{" "}
        {session?.username || session?.email || "Unknown"} |{" "}
        <strong>Devmain:</strong> {access?.isDevMain ? "Yes" : "No"}
      </Alert>

      <Card className="mb-4">
        <Card.Header className="fw-bold">Users (psb_s_user)</Card.Header>
        <Card.Body>
          <Row className="g-2 mb-3">
            <Col md={2}>
              <Form.Control
                placeholder="Username"
                value={newUser.username}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, username: event.target.value }))
                }
              />
            </Col>
            <Col md={2}>
              <Form.Control
                placeholder="Email"
                value={newUser.email}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, email: event.target.value }))
                }
              />
            </Col>
            <Col md={2}>
              <Form.Control
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, password: event.target.value }))
                }
              />
            </Col>
            <Col md={2}>
              <Form.Control
                placeholder="First Name"
                value={newUser.first_name}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, first_name: event.target.value }))
                }
              />
            </Col>
            <Col md={2}>
              <Form.Control
                placeholder="Last Name"
                value={newUser.last_name}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, last_name: event.target.value }))
                }
              />
            </Col>
            <Col md={2}>
              <Button variant="primary" className="w-100" onClick={createUser} disabled={busy}>
                Create User
              </Button>
            </Col>
          </Row>

          <Row className="g-2 mb-3">
            <Col md={4}>
              <Form.Select
                value={newUser.comp_id}
                onChange={(event) =>
                  setNewUser((prev) => ({
                    ...prev,
                    comp_id: event.target.value,
                    dept_id: "",
                  }))
                }
              >
                <option value="">Company...</option>
                {references.companies.map((company) => (
                  <option key={String(company.comp_id)} value={String(company.comp_id)}>
                    {getLabel(company, ["comp_name", "company_name"])}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Select
                value={newUser.dept_id}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, dept_id: event.target.value }))
                }
              >
                <option value="">Department...</option>
                {(departmentOptionsByCompany[newUser.comp_id] || references.departments).map(
                  (department) => (
                    <option
                      key={String(department.dept_id)}
                      value={String(department.dept_id)}
                    >
                      {getLabel(department, ["dept_name", "department_name"])}
                    </option>
                  )
                )}
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Select
                value={newUser.status_id}
                onChange={(event) =>
                  setNewUser((prev) => ({ ...prev, status_id: event.target.value }))
                }
              >
                <option value="">Status...</option>
                {references.statuses.map((status) => (
                  <option key={String(status.status_id)} value={String(status.status_id)}>
                    {getLabel(status, ["status_name"])}
                  </option>
                ))}
              </Form.Select>
            </Col>
          </Row>

          <div style={{ overflowX: "auto" }}>
            <Table size="sm" bordered hover>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Company</th>
                  <th>Dept</th>
                  <th>Status</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <tr key={String(user.user_id)}>
                    <td>{user.user_id}</td>
                    <td>
                      <Form.Control
                        size="sm"
                        value={user.username || ""}
                        onChange={(event) =>
                          setUsers((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], username: event.target.value };
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <Form.Control
                        size="sm"
                        value={user.email || ""}
                        onChange={(event) =>
                          setUsers((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], email: event.target.value };
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <Form.Control
                        size="sm"
                        value={user.first_name || ""}
                        onChange={(event) =>
                          setUsers((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], first_name: event.target.value };
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <Form.Control
                        size="sm"
                        value={user.last_name || ""}
                        onChange={(event) =>
                          setUsers((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], last_name: event.target.value };
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={asSelectValue(user.comp_id)}
                        onChange={(event) =>
                          setUsers((prev) => {
                            const next = [...prev];
                            next[index] = {
                              ...next[index],
                              comp_id: event.target.value,
                              dept_id: "",
                            };
                            return next;
                          })
                        }
                      >
                        <option value="">--</option>
                        {references.companies.map((company) => (
                          <option key={String(company.comp_id)} value={String(company.comp_id)}>
                            {getLabel(company, ["comp_name", "company_name"])}
                          </option>
                        ))}
                      </Form.Select>
                    </td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={asSelectValue(user.dept_id)}
                        onChange={(event) =>
                          setUsers((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], dept_id: event.target.value };
                            return next;
                          })
                        }
                      >
                        <option value="">--</option>
                        {(
                          departmentOptionsByCompany[asSelectValue(user.comp_id)] ||
                          references.departments
                        ).map((department) => (
                          <option
                            key={String(department.dept_id)}
                            value={String(department.dept_id)}
                          >
                            {getLabel(department, ["dept_name", "department_name"])}
                          </option>
                        ))}
                      </Form.Select>
                    </td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={asSelectValue(user.status_id)}
                        onChange={(event) =>
                          setUsers((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], status_id: event.target.value };
                            return next;
                          })
                        }
                      >
                        <option value="">--</option>
                        {references.statuses.map((status) => (
                          <option key={String(status.status_id)} value={String(status.status_id)}>
                            {getLabel(status, ["status_name"])}
                          </option>
                        ))}
                      </Form.Select>
                    </td>
                    <td>
                      <Form.Check
                        checked={Boolean(user.is_active)}
                        onChange={(event) =>
                          setUsers((prev) => {
                            const next = [...prev];
                            next[index] = {
                              ...next[index],
                              is_active: event.target.checked,
                            };
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => saveUserRow(user)}
                          disabled={busy}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => deactivateUser(user.user_id)}
                          disabled={busy}
                        >
                          Deactivate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>

      <Row className="g-3 mb-4">
        <Col lg={6}>
          <Card>
            <Card.Header className="fw-bold">Roles (psb_s_role)</Card.Header>
            <Card.Body>
              <Row className="g-2 mb-3">
                <Col md={5}>
                  <Form.Control
                    placeholder="Role name"
                    value={newRole.name}
                    onChange={(event) =>
                      setNewRole((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                </Col>
                <Col md={4}>
                  <Form.Control
                    placeholder="Role code"
                    value={newRole.code}
                    onChange={(event) =>
                      setNewRole((prev) => ({ ...prev, code: event.target.value }))
                    }
                  />
                </Col>
                <Col md={3}>
                  <Button className="w-100" onClick={createRole} disabled={busy}>
                    Add Role
                  </Button>
                </Col>
              </Row>

              <Table size="sm" bordered hover>
                <thead>
                  <tr>
                    <th>Role ID</th>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {references.roles.map((role, index) => (
                    <tr key={String(role.role_id)}>
                      <td>{role.role_id}</td>
                      <td>
                        <Form.Control
                          size="sm"
                          value={role.name || role.role_name || ""}
                          onChange={(event) =>
                            setReferences((prev) => {
                              const nextRoles = [...prev.roles];
                              nextRoles[index] = { ...nextRoles[index], name: event.target.value };
                              return { ...prev, roles: nextRoles };
                            })
                          }
                        />
                      </td>
                      <td>
                        <Form.Control
                          size="sm"
                          value={role.code || ""}
                          onChange={(event) =>
                            setReferences((prev) => {
                              const nextRoles = [...prev.roles];
                              nextRoles[index] = { ...nextRoles[index], code: event.target.value };
                              return { ...prev, roles: nextRoles };
                            })
                          }
                        />
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => updateRole(role)}
                            disabled={busy}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => deleteRole(role.role_id)}
                            disabled={busy}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={6}>
          <Card>
            <Card.Header className="fw-bold">Applications (psb_s_application)</Card.Header>
            <Card.Body>
              <Row className="g-2 mb-3">
                <Col md={5}>
                  <Form.Control
                    placeholder="Application name"
                    value={newApp.name}
                    onChange={(event) =>
                      setNewApp((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                </Col>
                <Col md={4}>
                  <Form.Control
                    placeholder="Application code"
                    value={newApp.code}
                    onChange={(event) =>
                      setNewApp((prev) => ({ ...prev, code: event.target.value }))
                    }
                  />
                </Col>
                <Col md={3}>
                  <Button className="w-100" onClick={createApplication} disabled={busy}>
                    Add App
                  </Button>
                </Col>
              </Row>

              <Table size="sm" bordered hover>
                <thead>
                  <tr>
                    <th>App ID</th>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {references.applications.map((application, index) => (
                    <tr key={String(application.app_id)}>
                      <td>{application.app_id}</td>
                      <td>
                        <Form.Control
                          size="sm"
                          value={application.name || application.app_name || ""}
                          onChange={(event) =>
                            setReferences((prev) => {
                              const nextApps = [...prev.applications];
                              nextApps[index] = {
                                ...nextApps[index],
                                name: event.target.value,
                              };
                              return { ...prev, applications: nextApps };
                            })
                          }
                        />
                      </td>
                      <td>
                        <Form.Control
                          size="sm"
                          value={application.code || ""}
                          onChange={(event) =>
                            setReferences((prev) => {
                              const nextApps = [...prev.applications];
                              nextApps[index] = {
                                ...nextApps[index],
                                code: event.target.value,
                              };
                              return { ...prev, applications: nextApps };
                            })
                          }
                        />
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => updateApplication(application)}
                            disabled={busy}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => deleteApplication(application.app_id)}
                            disabled={busy}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card>
        <Card.Header className="fw-bold">
          Access Mappings (psb_m_userappproleaccess)
        </Card.Header>
        <Card.Body>
          <Row className="g-2 mb-3">
            <Col md={4}>
              <Form.Select
                value={newMapping.user_id}
                onChange={(event) =>
                  setNewMapping((prev) => ({ ...prev, user_id: event.target.value }))
                }
              >
                <option value="">User...</option>
                {users.map((user) => (
                  <option key={String(user.user_id)} value={String(user.user_id)}>
                    {user.username || user.email || `User ${user.user_id}`}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Select
                value={newMapping.role_id}
                onChange={(event) =>
                  setNewMapping((prev) => ({ ...prev, role_id: event.target.value }))
                }
              >
                <option value="">Role...</option>
                {references.roles.map((role) => (
                  <option key={String(role.role_id)} value={String(role.role_id)}>
                    {getLabel(role, ["role_name"])}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Select
                value={newMapping.app_id}
                onChange={(event) =>
                  setNewMapping((prev) => ({ ...prev, app_id: event.target.value }))
                }
              >
                <option value="">Application...</option>
                {references.applications.map((application) => (
                  <option key={String(application.app_id)} value={String(application.app_id)}>
                    {getLabel(application, ["app_name"])}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={1}>
              <Button className="w-100" onClick={addMapping} disabled={busy}>
                Add
              </Button>
            </Col>
          </Row>

          <Table size="sm" bordered hover>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Application</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => {
                const userLabel =
                  users.find((user) => String(user.user_id) === String(mapping.user_id))
                    ?.username ||
                  users.find((user) => String(user.user_id) === String(mapping.user_id))
                    ?.email ||
                  mapping.user_id;

                const roleLabel =
                  references.roles.find(
                    (role) => String(role.role_id) === String(mapping.role_id)
                  ) || null;

                const appLabel =
                  references.applications.find(
                    (app) => String(app.app_id) === String(mapping.app_id)
                  ) || null;

                return (
                  <tr
                    key={`${mapping.user_id}:${mapping.role_id}:${mapping.app_id}`}
                  >
                    <td>{userLabel}</td>
                    <td>{roleLabel ? getLabel(roleLabel, ["role_name"]) : mapping.role_id}</td>
                    <td>{appLabel ? getLabel(appLabel, ["app_name"]) : mapping.app_id}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => removeMapping(mapping)}
                        disabled={busy}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </Container>
  );
}

