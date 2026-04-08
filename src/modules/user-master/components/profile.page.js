"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Col,
  Container,
  Row,
} from "react-bootstrap";
import { toastError, toastInfo, toastSuccess } from "@/shared/utils/toast";
import {
  cacheReferenceData,
  cacheSessionData,
  getCachedJson,
  USER_MASTER_CACHE_KEYS,
  USER_MASTER_CACHE_TTL,
} from "@/modules/user-master/cache/user-master.cache";

const INACTIVE_STATUS_HINTS = [
  "inactive",
  "disabled",
  "suspended",
  "locked",
  "deleted",
  "blocked",
  "archived",
];

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getLabel(record, preferredFields = []) {
  const candidates = [
    ...preferredFields,
    "sts_name",
    "comp_name",
    "dept_name",
    "status_name",
    "name",
    "label",
    "code",
    "title",
    "description",
  ];

  for (const field of candidates) {
    const value = record?.[field];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "(Unnamed)";
}

function buildInitials(firstName, lastName, username) {
  const first = String(firstName || "").trim().charAt(0);
  const last = String(lastName || "").trim().charAt(0);

  if (first || last) {
    return `${first}${last}`.toUpperCase();
  }

  return String(username || "U").trim().charAt(0).toUpperCase() || "U";
}

function statusIsActive(statusLabel, statusRecord) {
  if (statusRecord?.is_active === false) {
    return false;
  }

  const normalized = String(statusLabel || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return !INACTIVE_STATUS_HINTS.some((keyword) => normalized.includes(keyword));
}

function buildRequestUpdateMailto(adminEmail, username) {
  if (!hasText(adminEmail)) {
    return "";
  }

  const subject = encodeURIComponent(`Profile update request - ${String(username || "user").trim()}`);
  const body = encodeURIComponent(
    [
      "Hi,",
      "",
      "Please help update my profile details:",
      "-",
      "",
      "Thanks.",
    ].join("\n")
  );

  return `mailto:${adminEmail}?subject=${subject}&body=${body}`;
}

function normalizeProfilePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      user: null,
      relations: {},
    };
  }

  // Supports legacy cache shape (plain user object) and current API shape ({ user, relations }).
  if (Object.prototype.hasOwnProperty.call(payload, "user")) {
    return {
      user: payload.user || null,
      relations: payload.relations || {},
    };
  }

  return {
    user: payload,
    relations: {},
  };
}

export default function UserProfilePage() {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(null);
  const [relations, setRelations] = useState({
    company: null,
    department: null,
    status: null,
    roleGroupsByApp: [],
  });
  const [references, setReferences] = useState({
    companies: [],
    departments: [],
    statuses: [],
  });

  const [profile, setProfile] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
    comp_id: "",
    dept_id: "",
    status_id: "",
  });

  const loadProfile = useCallback(async (options = {}) => {
    const forceFresh = Boolean(options.forceFresh);
    setLoading(true);

    try {
      const [sessionPayload, profilePayloadRaw, bootstrapPayload] = await Promise.all([
        getCachedJson({
          key: USER_MASTER_CACHE_KEYS.session,
          url: "/api/user-master/session",
          ttlMs: USER_MASTER_CACHE_TTL.sessionMs,
          forceFresh,
          allowStaleOnError: false,
        }),
        getCachedJson({
          key: USER_MASTER_CACHE_KEYS.profile,
          url: "/api/user-master/profile",
          ttlMs: USER_MASTER_CACHE_TTL.profileMs,
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
      ]);

      let profilePayload = normalizeProfilePayload(profilePayloadRaw);

      // If cached profile data is incomplete, force a database refresh for this payload.
      if (!forceFresh && !profilePayload.user?.user_id) {
        try {
          const freshProfilePayloadRaw = await getCachedJson({
            key: USER_MASTER_CACHE_KEYS.profile,
            url: "/api/user-master/profile",
            ttlMs: USER_MASTER_CACHE_TTL.profileMs,
            forceFresh: true,
            allowStaleOnError: false,
          });

          profilePayload = normalizeProfilePayload(freshProfilePayloadRaw);
        } catch {
          // Keep best available cached/session data if fresh fetch fails.
        }
      }

      const cachedRoleGroups = Array.isArray(profilePayload?.relations?.roleGroupsByApp)
        ? profilePayload.relations.roleGroupsByApp
        : [];

      const sessionSuggestsMappedRoles = Boolean(
        sessionPayload?.access?.isDevMain ||
          (Array.isArray(sessionPayload?.access?.roleKeys) && sessionPayload.access.roleKeys.length > 0) ||
          Number(sessionPayload?.access?.activeMappingCount || 0) > 0 ||
          Number(sessionPayload?.access?.mappingCount || 0) > 0
      );

      if (!forceFresh && cachedRoleGroups.length === 0 && sessionSuggestsMappedRoles) {
        try {
          const refreshedProfilePayloadRaw = await getCachedJson({
            key: USER_MASTER_CACHE_KEYS.profile,
            url: "/api/user-master/profile",
            ttlMs: USER_MASTER_CACHE_TTL.profileMs,
            forceFresh: true,
            allowStaleOnError: false,
          });

          profilePayload = normalizeProfilePayload(refreshedProfilePayloadRaw);
        } catch {
          // Keep existing profile payload if forced refresh fails.
        }
      }

      const resolvedUser = profilePayload.user || sessionPayload.user || null;

      cacheSessionData({
        session: sessionPayload.session,
        user: resolvedUser,
        access: sessionPayload.access,
      });

      cacheReferenceData(bootstrapPayload);

      setAccess(sessionPayload.access || null);
      setRelations({
        company: profilePayload.relations?.company || null,
        department: profilePayload.relations?.department || null,
        status: profilePayload.relations?.status || null,
        roleGroupsByApp: Array.isArray(profilePayload.relations?.roleGroupsByApp)
          ? profilePayload.relations.roleGroupsByApp
          : [],
      });
      setReferences({
        companies: bootstrapPayload.companies || [],
        departments: bootstrapPayload.departments || [],
        statuses: bootstrapPayload.statuses || [],
      });

      const user = resolvedUser || {};
      setProfile({
        username: user.username || "",
        email: user.email || "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone: user.phone || "",
        address: user.address || "",
        comp_id: user.comp_id === undefined || user.comp_id === null ? "" : String(user.comp_id),
        dept_id: user.dept_id === undefined || user.dept_id === null ? "" : String(user.dept_id),
        status_id:
          user.status_id === undefined || user.status_id === null ? "" : String(user.status_id),
      });
    } catch (error) {
      toastError(error?.message || "Unable to load profile", "User Profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const companyLabel = useMemo(() => {
    const selected = references.companies.find(
      (company) => String(company.comp_id) === String(profile.comp_id)
    );

    if (selected) return getLabel(selected, ["comp_name", "company_name"]);
    if (relations?.company) return getLabel(relations.company, ["comp_name", "company_name"]);
    return "No company assigned";
  }, [profile.comp_id, references.companies, relations]);

  const departmentLabel = useMemo(() => {
    const selected = references.departments.find(
      (department) => String(department.dept_id) === String(profile.dept_id)
    );

    if (selected) return getLabel(selected, ["dept_name", "department_name"]);
    if (relations?.department) {
      return getLabel(relations.department, ["dept_name", "department_name"]);
    }
    return "No department assigned";
  }, [profile.dept_id, references.departments, relations]);

  const statusLabel = useMemo(() => {
    const selected = references.statuses.find(
      (status) => String(status.status_id) === String(profile.status_id)
    );

    if (selected) return getLabel(selected, ["sts_name", "status_name"]);
    if (relations?.status) return getLabel(relations.status, ["sts_name", "status_name"]);
    return "No status assigned";
  }, [profile.status_id, references.statuses, relations]);

  const fullName = useMemo(() => {
    const first = String(profile.first_name || "").trim();
    const last = String(profile.last_name || "").trim();

    if (first || last) {
      return `${first} ${last}`.trim();
    }

    return profile.username || "User";
  }, [profile.first_name, profile.last_name, profile.username]);

  const initials = useMemo(() => {
    return buildInitials(profile.first_name, profile.last_name, profile.username);
  }, [profile.first_name, profile.last_name, profile.username]);

  const adminEmail = useMemo(() => {
    const companyEmail = String(relations?.company?.comp_email || "").trim();
    return companyEmail || "";
  }, [relations]);

  const isActive = useMemo(() => {
    return statusIsActive(statusLabel, relations?.status);
  }, [relations?.status, statusLabel]);

  const fallbackRoleGroupFromAccess = useMemo(() => {
    const roleKeys = Array.isArray(access?.roleKeys)
      ? access.roleKeys
          .map((value) => String(value || "").trim())
          .filter((value) => value.length > 0)
      : [];

    if (roleKeys.length === 0) {
      return [];
    }

    return [
      {
        appId: "global",
        appName: "Global Access",
        roles: roleKeys.map((roleKey) => ({
          roleId: roleKey,
          roleName: roleKey.toUpperCase(),
        })),
      },
    ];
  }, [access?.roleKeys]);

  const roleGroupsByApp = useMemo(() => {
    const groups = Array.isArray(relations?.roleGroupsByApp) ? relations.roleGroupsByApp : [];

    const normalizedGroups = groups
      .map((group) => ({
        appId: String(group?.appId || ""),
        appName: String(group?.appName || "").trim() || "Unknown App",
        roles: (Array.isArray(group?.roles) ? group.roles : [])
          .map((role) => ({
            roleId: String(role?.roleId || ""),
            roleName: String(role?.roleName || "").trim(),
          }))
          .filter((role) => hasText(role.roleName)),
      }))
      .filter((group) => group.roles.length > 0);

    if (normalizedGroups.length > 0) {
      return normalizedGroups;
    }

    return fallbackRoleGroupFromAccess;
  }, [fallbackRoleGroupFromAccess, relations?.roleGroupsByApp]);

  const requestUpdateHref = useMemo(() => {
    return buildRequestUpdateMailto(adminEmail, profile.username);
  }, [adminEmail, profile.username]);

  const copyToClipboard = useCallback(async (value, label) => {
    const text = String(value || "").trim();
    if (!text) {
      toastInfo(`${label} is not available to copy.`, "User Profile");
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      toastSuccess(`${label} copied.`, "User Profile");
    } catch {
      toastError(`Unable to copy ${label.toLowerCase()}.`, "User Profile");
    }
  }, []);

  const renderValue = useCallback(
    (value, options = {}) => {
      const text = String(value || "").trim();

      if (text) {
        if (options.type === "email") {
          return (
            <a href={`mailto:${text}`} className="profile-inline-link">
              {text}
            </a>
          );
        }

        return <span>{text}</span>;
      }

      return (
        <span className="profile-empty-value">
          <span className="profile-empty-icon" aria-hidden="true">i</span>
          <span>Not available</span>
          {requestUpdateHref ? (
            <a href={requestUpdateHref} className="profile-empty-action-link">
              Request update
            </a>
          ) : null}
        </span>
      );
    },
    [requestUpdateHref]
  );

  if (loading) {
    return <Container className="py-4">Loading profile...</Container>;
  }

  return (
    <Container className="py-4 profile-page-shell" style={{ maxWidth: 1120 }}>
      <div className="mb-3">
        <h2 className="mb-0">User Profile</h2>
        <p className="text-muted mb-0">
          Profile view for your account.
        </p>
      </div>

      <div className="profile-readonly-alert notice-banner notice-banner-info mb-3">
        Profile and password updates are managed by administrators.
        Please email your administrator to request any changes.
      </div>

      {access && !access.hasAccess ? (
        <div className="notice-banner notice-banner-warning mb-3">
          Your account currently has no active app assignments.
        </div>
      ) : null}

      <Row className="g-3 align-items-stretch">
        <Col lg={4}>
          <Card className="profile-social-card border-0 shadow-sm h-100">
            <Card.Body className="profile-social-card-body">
              <div className="profile-card-actions">
                {requestUpdateHref ? (
                  <Button as="a" href={requestUpdateHref} size="sm" className="profile-action-primary">
                    Request Update
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => void copyToClipboard(profile.email, "Email")}
                >
                  Copy Email
                </Button>
                <Button
                  type="button"
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => void copyToClipboard(profile.username, "Username")}
                >
                  Copy Username
                </Button>
              </div>

              <div className="profile-social-content">
                <div className="profile-avatar">{initials}</div>
                <h3 className="profile-name mb-1 text-center">{fullName}</h3>
                <p className="profile-handle mb-2 text-center">@{String(profile.username || "unknown")}</p>
                <Badge bg="light" text="dark" className={`profile-status-badge ${isActive ? "status-active" : "status-inactive"}`}>
                  <span className="profile-status-indicator" aria-hidden="true" />
                  <span>{isActive ? "Active" : "Inactive"}</span>
                </Badge>

                <div className="profile-org-lines mt-3 text-center">
                  <p className="mb-1">{companyLabel}</p>
                  <p className="mb-0">{departmentLabel}</p>
                </div>

                {hasText(adminEmail) ? (
                  <div className="profile-admin-contact mt-3 text-center">
                    <p className="mb-1 text-muted">Administrator Contact</p>
                    <a href={`mailto:${adminEmail}`} className="profile-admin-link">
                      {adminEmail}
                    </a>
                  </div>
                ) : null}
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={8}>
          <Card className="profile-summary-card border-0 shadow-sm mb-3">
            <Card.Body className="profile-summary-card-body">
              <p className="profile-section-kicker mb-1">My PSB</p>
              <h4 className="mb-1">Profile Snapshot</h4>
              <p className="text-muted mb-2">
                Your account details are visible here for quick reference.
              </p>

              <div className="profile-roles-panel mb-2">
                <p className="profile-detail-label mb-1">Roles</p>
                {roleGroupsByApp.length > 0 ? (
                  <div className="profile-role-groups">
                    {roleGroupsByApp.map((group) => (
                      <div key={`role-group-${group.appId || group.appName}`} className="profile-role-group-card">
                        <p className="profile-role-app-name mb-1">{group.appName}</p>
                        <div className="profile-role-pills">
                          {group.roles.map((role) => (
                            <Badge key={`role-pill-${group.appId}-${role.roleId || role.roleName}`} className="profile-role-pill" bg="light" text="dark">
                              {role.roleName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="profile-empty-value profile-empty-roles">
                    <span className="profile-empty-icon" aria-hidden="true">i</span>
                    <span>No roles assigned</span>
                  </div>
                )}
              </div>

              <Row className="g-2 profile-info-grid">
                <Col sm={6}>
                  <div className="profile-detail-tile" tabIndex={0}>
                    <p className="profile-detail-label mb-1">Email</p>
                    <p className="profile-detail-value mb-0">{renderValue(profile.email, { type: "email" })}</p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile" tabIndex={0}>
                    <p className="profile-detail-label mb-1">Phone</p>
                    <p className="profile-detail-value mb-0">{renderValue(profile.phone)}</p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile" tabIndex={0}>
                    <p className="profile-detail-label mb-1">Address</p>
                    <p className="profile-detail-value mb-0">{renderValue(profile.address)}</p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile" tabIndex={0}>
                    <p className="profile-detail-label mb-1">Username</p>
                    <p className="profile-detail-value mb-0 d-flex align-items-center justify-content-between gap-2">
                      <span>{String(profile.username || "unknown")}</span>
                      <button
                        type="button"
                        className="profile-mini-copy"
                        onClick={() => void copyToClipboard(profile.username, "Username")}
                      >
                        Copy
                      </button>
                    </p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile" tabIndex={0}>
                    <p className="profile-detail-label mb-1">Company</p>
                    <p className="profile-detail-value mb-0">{companyLabel}</p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile" tabIndex={0}>
                    <p className="profile-detail-label mb-1">Department</p>
                    <p className="profile-detail-value mb-0">{departmentLabel}</p>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          <Card className="profile-request-card border-0 shadow-sm">
            <Card.Body>
              <h5 className="mb-2">Need to update something?</h5>
              <p className="text-muted mb-2">
                Profile fields and password changes are restricted to administrators only.
              </p>
              {requestUpdateHref ? (
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <a href={requestUpdateHref} className="btn btn-sm btn-primary">
                    Request Update
                  </a>
                  <p className="mb-0">Send your request by email and include your username plus exact changes needed.</p>
                </div>
              ) : (
                <p className="mb-0">Contact your administrator to request profile updates.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

