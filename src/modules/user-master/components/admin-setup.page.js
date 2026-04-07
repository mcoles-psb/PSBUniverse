"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  Modal,
  Row,
  Tab,
  Table,
  Tabs,
} from "react-bootstrap";
import {
  cacheReferenceData,
  clearSessionCache,
  getCachedJson,
  invalidateUserMasterCache,
  USER_MASTER_CACHE_KEYS,
  USER_MASTER_CACHE_TTL,
} from "@/modules/user-master/cache/user-master.cache";
import { toastError, toastInfo, toastSuccess, toastWarning } from "@/shared/utils/toast";
import { startNavbarLoader } from "@/shared/utils/navbar-loader";

const ADMIN_APP_KEY = "admin-config";

function getLabel(record, preferred = []) {
  const fields = [
    ...preferred,
    "role_name",
    "app_name",
    "sts_name",
    "comp_name",
    "dept_name",
    "name",
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

function formatDateTime(value) {
  if (!value) return "--";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "--";
  }
}

function emptyUserDraft() {
  return {
    user_id: null,
    username: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
    comp_id: "",
    dept_id: "",
    status_id: "",
    is_active: true,
  };
}

function emptyRoleDraft() {
  return {
    role_id: null,
    role_name: "",
    role_desc: "",
    is_active: true,
  };
}

function emptyApplicationDraft() {
  return {
    app_id: null,
    app_name: "",
    app_desc: "",
    is_active: true,
  };
}

function emptyAccessDraft() {
  return {
    uar_id: null,
    user_id: "",
    role_id: "",
    app_id: "",
    is_active: true,
  };
}

export default function AdminUserMasterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ text: "", variant: "info" });
  const [activeTab, setActiveTab] = useState("users");

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

  const [userModal, setUserModal] = useState({
    show: false,
    mode: "create",
    draft: emptyUserDraft(),
  });

  const [roleModal, setRoleModal] = useState({
    show: false,
    mode: "create",
    draft: emptyRoleDraft(),
  });

  const [applicationModal, setApplicationModal] = useState({
    show: false,
    mode: "create",
    draft: emptyApplicationDraft(),
  });

  const [accessModal, setAccessModal] = useState({
    show: false,
    mode: "create",
    draft: emptyAccessDraft(),
  });

  const departmentOptionsByCompany = useMemo(() => {
    return references.departments.reduce((map, department) => {
      const key = String(department.comp_id || "");
      if (!map[key]) map[key] = [];
      map[key].push(department);
      return map;
    }, {});
  }, [references.departments]);

  const userLookup = useMemo(() => {
    return new Map(users.map((user) => [String(user.user_id), user]));
  }, [users]);

  const roleLookup = useMemo(() => {
    return new Map(references.roles.map((role) => [String(role.role_id), role]));
  }, [references.roles]);

  const applicationLookup = useMemo(() => {
    return new Map(references.applications.map((app) => [String(app.app_id), app]));
  }, [references.applications]);

  const companyLookup = useMemo(() => {
    return new Map(references.companies.map((company) => [String(company.comp_id), company]));
  }, [references.companies]);

  const departmentLookup = useMemo(() => {
    return new Map(references.departments.map((department) => [String(department.dept_id), department]));
  }, [references.departments]);

  const statusLookup = useMemo(() => {
    return new Map(references.statuses.map((status) => [String(status.status_id), status]));
  }, [references.statuses]);

  const userModalDepartmentOptions = useMemo(() => {
    const compId = String(userModal.draft.comp_id || "");
    return departmentOptionsByCompany[compId] || references.departments;
  }, [departmentOptionsByCompany, references.departments, userModal.draft.comp_id]);

  const setError = useCallback((text) => {
    setFeedback({ text, variant: "danger" });
  }, []);

  const setInfo = useCallback((text, variant = "info") => {
    setFeedback({ text, variant });
  }, []);

  useEffect(() => {
    if (!feedback?.text) return;

    const message = String(feedback.text || "").trim();
    const variant = String(feedback.variant || "info").toLowerCase();

    if (!message) return;

    if (variant === "success") {
      toastSuccess(message, "Configuration & Settings");
    } else if (variant === "danger" || variant === "error") {
      toastError(message, "Configuration & Settings");
    } else if (variant === "warning") {
      toastWarning(message, "Configuration & Settings");
    } else {
      toastInfo(message, "Configuration & Settings");
    }

    setFeedback((prev) => ({ ...prev, text: "" }));
  }, [feedback]);

  const loadData = useCallback(
    async (options = {}) => {
      const forceFresh = Boolean(options.forceFresh);
      setLoading(true);
      setFeedback((prev) => ({ ...prev, text: "" }));

      try {
        const [sessionPayload, bootstrapPayload, usersPayload, mappingsPayload] = await Promise.all([
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

        setReferences({
          companies: bootstrapPayload.companies || [],
          departments: bootstrapPayload.departments || [],
          statuses: bootstrapPayload.statuses || [],
          roles: bootstrapPayload.roles || [],
          applications: bootstrapPayload.applications || [],
        });

        cacheReferenceData(bootstrapPayload);

        setUsers(usersPayload.users || []);
        setMappings(mappingsPayload.mappings || []);
      } catch (error) {
        setError(error?.message || "Unable to load configuration data");
      } finally {
        setLoading(false);
      }
    },
    [setError]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
      throw new Error(
        payload?.message ||
          payload?.error ||
          payload?.details?.message ||
          `${method} failed (${response.status})`
      );
    }

    return payload;
  }

  const upsertAccessMappingInState = useCallback((nextMapping) => {
    if (!nextMapping || nextMapping.uar_id === null || nextMapping.uar_id === undefined) {
      return;
    }

    setMappings((previous) => {
      let found = false;
      const next = previous.map((item) => {
        if (String(item.uar_id) !== String(nextMapping.uar_id)) {
          return item;
        }

        found = true;
        return {
          ...item,
          ...nextMapping,
        };
      });

      if (!found) {
        return [nextMapping, ...next];
      }

      return next;
    });
  }, []);

  const upsertUserInState = useCallback((nextUser) => {
    if (!nextUser || nextUser.user_id === null || nextUser.user_id === undefined) {
      return;
    }

    setUsers((previous) => {
      let found = false;
      const next = previous.map((item) => {
        if (String(item.user_id) !== String(nextUser.user_id)) {
          return item;
        }

        found = true;
        return {
          ...item,
          ...nextUser,
        };
      });

      if (!found) {
        return [nextUser, ...next];
      }

      return next;
    });
  }, []);

  const upsertRoleInState = useCallback((nextRole) => {
    if (!nextRole || nextRole.role_id === null || nextRole.role_id === undefined) {
      return;
    }

    setReferences((previous) => {
      let found = false;
      const nextRoles = (previous.roles || []).map((item) => {
        if (String(item.role_id) !== String(nextRole.role_id)) {
          return item;
        }

        found = true;
        return {
          ...item,
          ...nextRole,
        };
      });

      return {
        ...previous,
        roles: found ? nextRoles : [nextRole, ...nextRoles],
      };
    });
  }, []);

  const upsertApplicationInState = useCallback((nextApplication) => {
    if (
      !nextApplication ||
      nextApplication.app_id === null ||
      nextApplication.app_id === undefined
    ) {
      return;
    }

    setReferences((previous) => {
      let found = false;
      const nextApplications = (previous.applications || []).map((item) => {
        if (String(item.app_id) !== String(nextApplication.app_id)) {
          return item;
        }

        found = true;
        return {
          ...item,
          ...nextApplication,
        };
      });

      return {
        ...previous,
        applications: found ? nextApplications : [nextApplication, ...nextApplications],
      };
    });
  }, []);

  async function handleLogout() {
    setBusy(true);
    setFeedback({ text: "", variant: "info" });
    try {
      await callApi("/api/auth/logout", "POST");
      clearSessionCache(ADMIN_APP_KEY);
      startNavbarLoader();
      router.push("/login");
    } catch (error) {
      setError(error?.message || "Logout failed");
    } finally {
      setBusy(false);
    }
  }

  function openCreateUserModal() {
    setUserModal({
      show: true,
      mode: "create",
      draft: emptyUserDraft(),
    });
  }

  function openEditUserModal(user) {
    setUserModal({
      show: true,
      mode: "edit",
      draft: {
        user_id: user.user_id,
        username: user.username || "",
        email: user.email || "",
        password: "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone: user.phone || "",
        address: user.address || "",
        comp_id: asSelectValue(user.comp_id),
        dept_id: asSelectValue(user.dept_id),
        status_id: asSelectValue(user.status_id),
        is_active: Boolean(user.is_active),
      },
    });
  }

  function closeUserModal() {
    setUserModal((prev) => ({ ...prev, show: false }));
  }

  async function submitUserModal(event) {
    event.preventDefault();

    const draft = userModal.draft;

    if (!String(draft.username || "").trim() && !String(draft.email || "").trim()) {
      setError("Username or email is required.");
      return;
    }

    if (userModal.mode === "create" && !String(draft.password || "").trim()) {
      setError("Password is required when adding a user.");
      return;
    }

    setBusy(true);
    setFeedback({ text: "", variant: "info" });

    try {
      const payload = {
        username: String(draft.username || "").trim() || null,
        email: String(draft.email || "").trim() || null,
        first_name: String(draft.first_name || "").trim() || null,
        last_name: String(draft.last_name || "").trim() || null,
        phone: String(draft.phone || "").trim() || null,
        address: String(draft.address || "").trim() || null,
        comp_id: toNullableNumber(draft.comp_id),
        dept_id: toNullableNumber(draft.dept_id),
        status_id: toNullableNumber(draft.status_id),
        is_active: Boolean(draft.is_active),
      };

      if (userModal.mode === "create") {
        const payloadResponse = await callApi(
          `/api/user-master/admin/users?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "POST",
          {
            ...payload,
            password: String(draft.password || ""),
          }
        );

        const nextUser = payloadResponse?.data?.user || payloadResponse?.user;
        if (nextUser) {
          upsertUserInState(nextUser);
        }

        setInfo(payloadResponse?.message || "User added.", "success");
      } else {
        const payloadResponse = await callApi(
          `/api/user-master/admin/users?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "PATCH",
          {
            user_id: draft.user_id,
            ...payload,
            ...(String(draft.password || "").trim() ? { password: String(draft.password) } : {}),
          }
        );

        const nextUser = payloadResponse?.data?.user || payloadResponse?.user;
        if (nextUser) {
          upsertUserInState(nextUser);
        }

        setInfo(payloadResponse?.message || "User updated.", "success");
      }

      closeUserModal();
      invalidateUserMasterCache([USER_MASTER_CACHE_KEYS.users, USER_MASTER_CACHE_KEYS.bootstrap]);
    } catch (error) {
      setError(error?.message || "Unable to save user");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateUser(userId) {
    setBusy(true);
    setFeedback({ text: "", variant: "info" });

    try {
      const payloadResponse = await callApi(
        `/api/user-master/admin/users?appKey=${encodeURIComponent(ADMIN_APP_KEY)}&user_id=${encodeURIComponent(userId)}`,
        "DELETE"
      );

      const nextUser = payloadResponse?.data?.user || payloadResponse?.user;
      if (nextUser) {
        upsertUserInState(nextUser);
      } else {
        setUsers((previous) =>
          previous.map((item) =>
            String(item.user_id) === String(userId) ? { ...item, is_active: false } : item
          )
        );
      }

      invalidateUserMasterCache([USER_MASTER_CACHE_KEYS.users]);
      setInfo(payloadResponse?.message || "User deactivated.", "success");
    } catch (error) {
      setError(error?.message || "Unable to deactivate user");
    } finally {
      setBusy(false);
    }
  }

  function openCreateRoleModal() {
    setRoleModal({
      show: true,
      mode: "create",
      draft: emptyRoleDraft(),
    });
  }

  function openEditRoleModal(role) {
    setRoleModal({
      show: true,
      mode: "edit",
      draft: {
        role_id: role.role_id,
        role_name: role.role_name || "",
        role_desc: role.role_desc || "",
        is_active: role.is_active !== false,
      },
    });
  }

  function closeRoleModal() {
    setRoleModal((prev) => ({ ...prev, show: false }));
  }

  async function submitRoleModal(event) {
    event.preventDefault();

    const draft = roleModal.draft;
    if (!String(draft.role_name || "").trim()) {
      setError("Role name is required.");
      return;
    }

    setBusy(true);
    setFeedback({ text: "", variant: "info" });

    try {
      const payload = {
        role_name: String(draft.role_name || "").trim(),
        role_desc: String(draft.role_desc || "").trim() || null,
        is_active: Boolean(draft.is_active),
      };

      if (roleModal.mode === "create") {
        const payloadResponse = await callApi(
          `/api/user-master/admin/roles?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "POST",
          payload
        );

        const nextRole = payloadResponse?.data?.role || payloadResponse?.role;
        if (nextRole) {
          upsertRoleInState(nextRole);
        }

        setInfo(payloadResponse?.message || "Role added.", "success");
      } else {
        const payloadResponse = await callApi(
          `/api/user-master/admin/roles?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "PATCH",
          {
            role_id: draft.role_id,
            ...payload,
          }
        );

        const nextRole = payloadResponse?.data?.role || payloadResponse?.role;
        if (nextRole) {
          upsertRoleInState(nextRole);
        }

        setInfo(payloadResponse?.message || "Role updated.", "success");
      }

      closeRoleModal();
      invalidateUserMasterCache([USER_MASTER_CACHE_KEYS.bootstrap, USER_MASTER_CACHE_KEYS.mappings]);
    } catch (error) {
      setError(error?.message || "Unable to save role");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateRole(roleId) {
    setBusy(true);
    setFeedback({ text: "", variant: "info" });

    try {
      const payloadResponse = await callApi(
        `/api/user-master/admin/roles?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
        "PATCH",
        {
          role_id: roleId,
          is_active: false,
        }
      );

      const nextRole = payloadResponse?.data?.role || payloadResponse?.role;
      if (nextRole) {
        upsertRoleInState(nextRole);
      } else {
        setReferences((previous) => ({
          ...previous,
          roles: (previous.roles || []).map((item) =>
            String(item.role_id) === String(roleId) ? { ...item, is_active: false } : item
          ),
        }));
      }

      invalidateUserMasterCache([USER_MASTER_CACHE_KEYS.bootstrap, USER_MASTER_CACHE_KEYS.mappings]);
      setInfo(payloadResponse?.message || "Role deactivated.", "success");
    } catch (error) {
      setError(error?.message || "Unable to deactivate role");
    } finally {
      setBusy(false);
    }
  }

  function openCreateApplicationModal() {
    setApplicationModal({
      show: true,
      mode: "create",
      draft: emptyApplicationDraft(),
    });
  }

  function openEditApplicationModal(application) {
    setApplicationModal({
      show: true,
      mode: "edit",
      draft: {
        app_id: application.app_id,
        app_name: application.app_name || "",
        app_desc: application.app_desc || "",
        is_active: application.is_active !== false,
      },
    });
  }

  function closeApplicationModal() {
    setApplicationModal((prev) => ({ ...prev, show: false }));
  }

  async function submitApplicationModal(event) {
    event.preventDefault();

    const draft = applicationModal.draft;
    if (!String(draft.app_name || "").trim()) {
      setError("Application name is required.");
      return;
    }

    setBusy(true);
    setFeedback({ text: "", variant: "info" });

    try {
      const payload = {
        app_name: String(draft.app_name || "").trim(),
        app_desc: String(draft.app_desc || "").trim() || null,
        is_active: Boolean(draft.is_active),
      };

      if (applicationModal.mode === "create") {
        const payloadResponse = await callApi(
          `/api/user-master/admin/applications?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "POST",
          payload
        );

        const nextApplication =
          payloadResponse?.data?.application || payloadResponse?.application;
        if (nextApplication) {
          upsertApplicationInState(nextApplication);
        }

        setInfo(payloadResponse?.message || "Application added.", "success");
      } else {
        const payloadResponse = await callApi(
          `/api/user-master/admin/applications?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "PATCH",
          {
            app_id: draft.app_id,
            ...payload,
          }
        );

        const nextApplication =
          payloadResponse?.data?.application || payloadResponse?.application;
        if (nextApplication) {
          upsertApplicationInState(nextApplication);
        }

        setInfo(payloadResponse?.message || "Application updated.", "success");
      }

      closeApplicationModal();
      invalidateUserMasterCache([USER_MASTER_CACHE_KEYS.bootstrap, USER_MASTER_CACHE_KEYS.mappings]);
    } catch (error) {
      setError(error?.message || "Unable to save application");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateApplication(appId) {
    setBusy(true);
    setFeedback({ text: "", variant: "info" });

    try {
      const payloadResponse = await callApi(
        `/api/user-master/admin/applications?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
        "PATCH",
        {
          app_id: appId,
          is_active: false,
        }
      );

      const nextApplication = payloadResponse?.data?.application || payloadResponse?.application;
      if (nextApplication) {
        upsertApplicationInState(nextApplication);
      } else {
        setReferences((previous) => ({
          ...previous,
          applications: (previous.applications || []).map((item) =>
            String(item.app_id) === String(appId) ? { ...item, is_active: false } : item
          ),
        }));
      }

      invalidateUserMasterCache([USER_MASTER_CACHE_KEYS.bootstrap, USER_MASTER_CACHE_KEYS.mappings]);
      setInfo(payloadResponse?.message || "Application deactivated.", "success");
    } catch (error) {
      setError(error?.message || "Unable to deactivate application");
    } finally {
      setBusy(false);
    }
  }

  function openCreateAccessModal() {
    setAccessModal({
      show: true,
      mode: "create",
      draft: emptyAccessDraft(),
    });
  }

  function openEditAccessModal(mapping) {
    setAccessModal({
      show: true,
      mode: "edit",
      draft: {
        uar_id: mapping.uar_id,
        user_id: asSelectValue(mapping.user_id),
        role_id: asSelectValue(mapping.role_id),
        app_id: asSelectValue(mapping.app_id),
        is_active: mapping.is_active !== false,
      },
    });
  }

  function closeAccessModal() {
    setAccessModal((prev) => ({ ...prev, show: false }));
  }

  async function submitAccessModal(event) {
    event.preventDefault();

    const draft = accessModal.draft;
    if (!draft.user_id || !draft.role_id || !draft.app_id) {
      setError("User, role, and application are required.");
      return;
    }

    setBusy(true);
    setFeedback({ text: "", variant: "info" });

    try {
      const payload = {
        user_id: toNullableNumber(draft.user_id),
        role_id: toNullableNumber(draft.role_id),
        app_id: toNullableNumber(draft.app_id),
        is_active: Boolean(draft.is_active),
      };

      if (accessModal.mode === "create") {
        const payloadResponse = await callApi(
          `/api/user-master/admin/access-mappings?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "POST",
          payload
        );

        const nextMapping = payloadResponse?.data?.mapping || payloadResponse?.mapping;
        if (nextMapping) {
          upsertAccessMappingInState(nextMapping);
        }

        setInfo(payloadResponse?.message || "Access mapping added.", "success");
      } else {
        const payloadResponse = await callApi(
          `/api/user-master/admin/access-mappings?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
          "PATCH",
          {
            id: draft.uar_id,
            ...payload,
          }
        );

        const nextMapping = payloadResponse?.data?.mapping || payloadResponse?.mapping;
        if (nextMapping) {
          upsertAccessMappingInState(nextMapping);
        }

        setInfo(payloadResponse?.message || "Access mapping updated.", "success");
      }

      closeAccessModal();
      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.mappings,
        USER_MASTER_CACHE_KEYS.access(ADMIN_APP_KEY),
      ]);
    } catch (error) {
      setError(error?.message || "Unable to save access mapping");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateAccessMapping(uarId) {
    setBusy(true);
    setFeedback({ text: "", variant: "info" });

    try {
      const payloadResponse = await callApi(
        `/api/user-master/admin/access-mappings?appKey=${encodeURIComponent(ADMIN_APP_KEY)}`,
        "PATCH",
        {
          id: uarId,
          is_active: false,
        }
      );

      const nextMapping = payloadResponse?.data?.mapping || payloadResponse?.mapping;
      if (nextMapping) {
        upsertAccessMappingInState(nextMapping);
      } else {
        setMappings((previous) =>
          previous.map((item) =>
            String(item.uar_id) === String(uarId) ? { ...item, is_active: false } : item
          )
        );
      }

      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.mappings,
        USER_MASTER_CACHE_KEYS.access(ADMIN_APP_KEY),
      ]);
      setInfo(payloadResponse?.message || "Access mapping deactivated.", "success");
    } catch (error) {
      setError(error?.message || "Unable to deactivate access mapping");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Container className="py-4">Loading configuration...</Container>;
  }

  if (access && !access.permissions?.read && !access.isDevMain) {
    return (
      <Container className="py-4" style={{ maxWidth: 980 }}>
        <div className="notice-banner notice-banner-danger">
          You do not have permission to access Configuration & Settings for app key {ADMIN_APP_KEY}.
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: 1260 }}>
      <div className="d-flex align-items-center mb-3 justify-content-between">
        <div className="d-flex align-items-center">
          <Link href="/" className="back-link me-3">
            <i className="bi bi-arrow-left" aria-hidden="true" /> Back
          </Link>
          <div>
            <h2 className="mb-0">Configuration and Settings</h2>
            <p className="text-muted mb-0">
              Manage User Master setup by target table.
            </p>
          </div>
        </div>
        <div className="d-flex gap-2">
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => loadData({ forceFresh: true })}
            disabled={busy}
          >
            Refresh
          </Button>
          <Button type="button" variant="outline-danger" onClick={handleLogout} disabled={busy}>
            Logout
          </Button>
        </div>
      </div>

      <div className="notice-banner notice-banner-muted mb-3">
        <strong>Session User:</strong> {session?.username || session?.email || "Unknown"} |{" "}
        <strong>Devmain:</strong> {access?.isDevMain ? "Yes" : "No"}
      </div>

      <Tabs
        id="configuration-tabs"
        activeKey={activeTab}
        onSelect={(key) => setActiveTab(key || "users")}
        className="mb-3"
      >
        <Tab eventKey="users" title="Users">
          <Card>
            <Card.Header className="d-flex align-items-center justify-content-between fw-bold">
              <span>Users (psb_s_user)</span>
              <Button type="button" size="sm" onClick={openCreateUserModal} disabled={busy}>
                Add User
              </Button>
            </Card.Header>
            <Card.Body>
              <div style={{ overflowX: "auto" }}>
                <Table size="sm" bordered hover>
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Company</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const company = companyLookup.get(String(user.comp_id || ""));
                      const department = departmentLookup.get(String(user.dept_id || ""));
                      const status = statusLookup.get(String(user.status_id || ""));

                      return (
                        <tr key={String(user.user_id)}>
                          <td>{user.user_id}</td>
                          <td>{user.username || "--"}</td>
                          <td>{user.email || "--"}</td>
                          <td>{[user.first_name, user.last_name].filter(Boolean).join(" ") || "--"}</td>
                          <td>{company ? getLabel(company, ["comp_name"]) : "--"}</td>
                          <td>{department ? getLabel(department, ["dept_name"]) : "--"}</td>
                          <td>{status ? getLabel(status, ["sts_name", "status_name"]) : "--"}</td>
                          <td>
                            <Badge bg={user.is_active ? "success" : "secondary"}>
                              {user.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td>
                            <div className="d-flex gap-1">
                              <Button
                                  type="button"
                                size="sm"
                                variant="outline-primary"
                                onClick={() => openEditUserModal(user)}
                                disabled={busy}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline-danger"
                                onClick={() => deactivateUser(user.user_id)}
                                disabled={busy || !user.is_active}
                              >
                                Deactivate
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="roles" title="Roles">
          <Card>
            <Card.Header className="d-flex align-items-center justify-content-between fw-bold">
              <span>Roles (psb_s_role)</span>
              <Button type="button" size="sm" onClick={openCreateRoleModal} disabled={busy}>
                Add Role
              </Button>
            </Card.Header>
            <Card.Body>
              <Table size="sm" bordered hover>
                <thead>
                  <tr>
                    <th>Role ID</th>
                    <th>Role Name</th>
                    <th>Description</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {references.roles.map((role) => (
                    <tr key={String(role.role_id)}>
                      <td>{role.role_id}</td>
                      <td>{role.role_name || "--"}</td>
                      <td>{role.role_desc || "--"}</td>
                      <td>
                        <Badge bg={role.is_active ? "success" : "secondary"}>
                          {role.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline-primary"
                            onClick={() => openEditRoleModal(role)}
                            disabled={busy}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline-danger"
                            onClick={() => deactivateRole(role.role_id)}
                            disabled={busy || !role.is_active}
                          >
                            Deactivate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="applications" title="Applications">
          <Card>
            <Card.Header className="d-flex align-items-center justify-content-between fw-bold">
              <span>Applications (psb_s_application)</span>
              <Button type="button" size="sm" onClick={openCreateApplicationModal} disabled={busy}>
                Add Application
              </Button>
            </Card.Header>
            <Card.Body>
              <Table size="sm" bordered hover>
                <thead>
                  <tr>
                    <th>App ID</th>
                    <th>Application Name</th>
                    <th>Description</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {references.applications.map((application) => (
                    <tr key={String(application.app_id)}>
                      <td>{application.app_id}</td>
                      <td>{application.app_name || "--"}</td>
                      <td>{application.app_desc || "--"}</td>
                      <td>
                        <Badge bg={application.is_active ? "success" : "secondary"}>
                          {application.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline-primary"
                            onClick={() => openEditApplicationModal(application)}
                            disabled={busy}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline-danger"
                            onClick={() => deactivateApplication(application.app_id)}
                            disabled={busy || !application.is_active}
                          >
                            Deactivate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="access" title="Access">
          <Card>
            <Card.Header className="d-flex align-items-center justify-content-between fw-bold">
              <span>Access Mappings (psb_m_userapproleaccess)</span>
              <Button type="button" size="sm" onClick={openCreateAccessModal} disabled={busy}>
                Add Access
              </Button>
            </Card.Header>
            <Card.Body>
              <div style={{ overflowX: "auto" }}>
                <Table size="sm" bordered hover>
                  <thead>
                    <tr>
                      <th>Mapping ID</th>
                      <th>User</th>
                      <th>Role</th>
                      <th>Application</th>
                      <th>Active</th>
                      <th>Created At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((mapping) => {
                      const user = userLookup.get(String(mapping.user_id || ""));
                      const role = roleLookup.get(String(mapping.role_id || ""));
                      const application = applicationLookup.get(String(mapping.app_id || ""));

                      const userLabel =
                        user?.username || user?.email || `User ${String(mapping.user_id)}`;
                      const roleLabel = role ? getLabel(role, ["role_name"]) : mapping.role_id;
                      const appLabel = application
                        ? getLabel(application, ["app_name"])
                        : mapping.app_id;

                      return (
                        <tr key={String(mapping.uar_id)}>
                          <td>{mapping.uar_id}</td>
                          <td>{userLabel}</td>
                          <td>{roleLabel}</td>
                          <td>{appLabel}</td>
                          <td>
                            <Badge bg={mapping.is_active ? "success" : "secondary"}>
                              {mapping.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td>{formatDateTime(mapping.created_at)}</td>
                          <td>
                            <div className="d-flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline-primary"
                                onClick={() => openEditAccessModal(mapping)}
                                disabled={busy}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline-danger"
                                onClick={() => deactivateAccessMapping(mapping.uar_id)}
                                disabled={busy || !mapping.is_active}
                              >
                                Deactivate
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>

      <Modal show={userModal.show} onHide={closeUserModal} centered size="lg">
        <Form onSubmit={submitUserModal}>
          <Modal.Header closeButton>
            <Modal.Title>
              {userModal.mode === "create" ? "Add User" : "Edit User"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Username</Form.Label>
                  <Form.Control
                    value={userModal.draft.username}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: { ...prev.draft, username: event.target.value },
                      }))
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={userModal.draft.email}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: { ...prev.draft, email: event.target.value },
                      }))
                    }
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>
                    Password {userModal.mode === "create" ? "(required)" : "(optional)"}
                  </Form.Label>
                  <Form.Control
                    type="password"
                    value={userModal.draft.password}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: { ...prev.draft, password: event.target.value },
                      }))
                    }
                    placeholder={
                      userModal.mode === "create"
                        ? "Enter password"
                        : "Leave blank to keep existing password"
                    }
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>First Name</Form.Label>
                  <Form.Control
                    value={userModal.draft.first_name}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: { ...prev.draft, first_name: event.target.value },
                      }))
                    }
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>Last Name</Form.Label>
                  <Form.Control
                    value={userModal.draft.last_name}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: { ...prev.draft, last_name: event.target.value },
                      }))
                    }
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>Phone</Form.Label>
                  <Form.Control
                    value={userModal.draft.phone}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: { ...prev.draft, phone: event.target.value },
                      }))
                    }
                  />
                </Form.Group>
              </Col>

              <Col md={12}>
                <Form.Group>
                  <Form.Label>Address</Form.Label>
                  <Form.Control
                    value={userModal.draft.address}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: { ...prev.draft, address: event.target.value },
                      }))
                    }
                  />
                </Form.Group>
              </Col>

              <Col md={4}>
                <Form.Group>
                  <Form.Label>Company</Form.Label>
                  <Form.Select
                    value={userModal.draft.comp_id}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: {
                          ...prev.draft,
                          comp_id: event.target.value,
                          dept_id: "",
                        },
                      }))
                    }
                  >
                    <option value="">Select company...</option>
                    {references.companies.map((company) => (
                      <option key={String(company.comp_id)} value={String(company.comp_id)}>
                        {getLabel(company, ["comp_name"]) }
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col md={4}>
                <Form.Group>
                  <Form.Label>Department</Form.Label>
                  <Form.Select
                    value={userModal.draft.dept_id}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: { ...prev.draft, dept_id: event.target.value },
                      }))
                    }
                  >
                    <option value="">Select department...</option>
                    {userModalDepartmentOptions.map((department) => (
                      <option key={String(department.dept_id)} value={String(department.dept_id)}>
                        {getLabel(department, ["dept_name"])}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col md={4}>
                <Form.Group>
                  <Form.Label>Status</Form.Label>
                  <Form.Select
                    value={userModal.draft.status_id}
                    onChange={(event) =>
                      setUserModal((prev) => ({
                        ...prev,
                        draft: { ...prev.draft, status_id: event.target.value },
                      }))
                    }
                  >
                    <option value="">Select status...</option>
                    {references.statuses.map((status) => (
                      <option key={String(status.status_id)} value={String(status.status_id)}>
                        {getLabel(status, ["sts_name", "status_name"])}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col md={12}>
                <Form.Check
                  type="switch"
                  label="Active"
                  checked={Boolean(userModal.draft.is_active)}
                  onChange={(event) =>
                    setUserModal((prev) => ({
                      ...prev,
                      draft: { ...prev.draft, is_active: event.target.checked },
                    }))
                  }
                />
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline-secondary" onClick={closeUserModal} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : userModal.mode === "create" ? "Add User" : "Save Changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={roleModal.show} onHide={closeRoleModal} centered>
        <Form onSubmit={submitRoleModal}>
          <Modal.Header closeButton>
            <Modal.Title>{roleModal.mode === "create" ? "Add Role" : "Edit Role"}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Role Name</Form.Label>
              <Form.Control
                value={roleModal.draft.role_name}
                onChange={(event) =>
                  setRoleModal((prev) => ({
                    ...prev,
                    draft: { ...prev.draft, role_name: event.target.value },
                  }))
                }
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                value={roleModal.draft.role_desc}
                onChange={(event) =>
                  setRoleModal((prev) => ({
                    ...prev,
                    draft: { ...prev.draft, role_desc: event.target.value },
                  }))
                }
              />
            </Form.Group>

            <Form.Check
              type="switch"
              label="Active"
              checked={Boolean(roleModal.draft.is_active)}
              onChange={(event) =>
                setRoleModal((prev) => ({
                  ...prev,
                  draft: { ...prev.draft, is_active: event.target.checked },
                }))
              }
            />
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline-secondary" onClick={closeRoleModal} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : roleModal.mode === "create" ? "Add Role" : "Save Changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={applicationModal.show} onHide={closeApplicationModal} centered>
        <Form onSubmit={submitApplicationModal}>
          <Modal.Header closeButton>
            <Modal.Title>
              {applicationModal.mode === "create" ? "Add Application" : "Edit Application"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Application Name</Form.Label>
              <Form.Control
                value={applicationModal.draft.app_name}
                onChange={(event) =>
                  setApplicationModal((prev) => ({
                    ...prev,
                    draft: { ...prev.draft, app_name: event.target.value },
                  }))
                }
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                value={applicationModal.draft.app_desc}
                onChange={(event) =>
                  setApplicationModal((prev) => ({
                    ...prev,
                    draft: { ...prev.draft, app_desc: event.target.value },
                  }))
                }
              />
            </Form.Group>

            <Form.Check
              type="switch"
              label="Active"
              checked={Boolean(applicationModal.draft.is_active)}
              onChange={(event) =>
                setApplicationModal((prev) => ({
                  ...prev,
                  draft: { ...prev.draft, is_active: event.target.checked },
                }))
              }
            />
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline-secondary" onClick={closeApplicationModal} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Saving..."
                : applicationModal.mode === "create"
                ? "Add Application"
                : "Save Changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={accessModal.show} onHide={closeAccessModal} centered>
        <Form onSubmit={submitAccessModal}>
          <Modal.Header closeButton>
            <Modal.Title>
              {accessModal.mode === "create" ? "Add Access Mapping" : "Edit Access Mapping"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>User</Form.Label>
              <Form.Select
                value={accessModal.draft.user_id}
                onChange={(event) =>
                  setAccessModal((prev) => ({
                    ...prev,
                    draft: { ...prev.draft, user_id: event.target.value },
                  }))
                }
              >
                <option value="">Select user...</option>
                {users.map((user) => (
                  <option key={String(user.user_id)} value={String(user.user_id)}>
                    {user.username || user.email || `User ${user.user_id}`}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Role</Form.Label>
              <Form.Select
                value={accessModal.draft.role_id}
                onChange={(event) =>
                  setAccessModal((prev) => ({
                    ...prev,
                    draft: { ...prev.draft, role_id: event.target.value },
                  }))
                }
              >
                <option value="">Select role...</option>
                {references.roles.map((role) => (
                  <option key={String(role.role_id)} value={String(role.role_id)}>
                    {getLabel(role, ["role_name"])}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Application</Form.Label>
              <Form.Select
                value={accessModal.draft.app_id}
                onChange={(event) =>
                  setAccessModal((prev) => ({
                    ...prev,
                    draft: { ...prev.draft, app_id: event.target.value },
                  }))
                }
              >
                <option value="">Select application...</option>
                {references.applications.map((application) => (
                  <option key={String(application.app_id)} value={String(application.app_id)}>
                    {getLabel(application, ["app_name"])}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Check
              type="switch"
              label="Active"
              checked={Boolean(accessModal.draft.is_active)}
              onChange={(event) =>
                setAccessModal((prev) => ({
                  ...prev,
                  draft: { ...prev.draft, is_active: event.target.checked },
                }))
              }
            />
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline-secondary" onClick={closeAccessModal} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Saving..."
                : accessModal.mode === "create"
                ? "Add Access"
                : "Save Changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
