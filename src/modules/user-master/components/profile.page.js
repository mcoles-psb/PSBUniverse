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
import { toastError } from "@/shared/utils/toast";
import {
  cacheReferenceData,
  cacheSessionData,
  getCachedJson,
  USER_MASTER_CACHE_KEYS,
  USER_MASTER_CACHE_TTL,
} from "@/modules/user-master/cache/user-master.cache";

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

function getValue(value, fallback = "Not provided") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function buildInitials(firstName, lastName, username) {
  const first = String(firstName || "").trim().charAt(0);
  const last = String(lastName || "").trim().charAt(0);

  if (first || last) {
    return `${first}${last}`.toUpperCase();
  }

  return String(username || "U").trim().charAt(0).toUpperCase() || "U";
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
  const [session, setSession] = useState(null);
  const [access, setAccess] = useState(null);
  const [relations, setRelations] = useState({
    company: null,
    department: null,
    status: null,
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

      const resolvedUser = profilePayload.user || sessionPayload.user || null;

      cacheSessionData({
        session: sessionPayload.session,
        user: resolvedUser,
        access: sessionPayload.access,
      });

      cacheReferenceData(bootstrapPayload);

      setSession(sessionPayload.session || null);
      setAccess(sessionPayload.access || null);
      setRelations(profilePayload.relations || {});
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

  const roleSummary = useMemo(() => {
    if (!access) return "Role is being resolved";

    if (access.isDevMain) {
      return "DEVMAIN";
    }

    if (Array.isArray(access.roleKeys) && access.roleKeys.length > 0) {
      return access.roleKeys.map((value) => String(value || "").toUpperCase()).join(" • ");
    }

    return access.hasAccess ? "Assigned User" : "Unassigned User";
  }, [access]);

  if (loading) {
    return <Container className="py-4">Loading profile...</Container>;
  }

  return (
    <Container className="py-4 profile-page-shell" style={{ maxWidth: 1120 }}>
      <div className="mb-3">
        <h2 className="mb-0">User Profile</h2>
        <p className="text-muted mb-0">
          A simple, read-only profile view for your account.
        </p>
      </div>

      <div className="profile-readonly-alert notice-banner notice-banner-info mb-3">
        Profile and password updates are managed by administrators in Configuration & Settings.
        Please email your administrator to request any changes.
      </div>

      {access && !access.hasAccess ? (
        <div className="notice-banner notice-banner-warning mb-3">
          Your account has no role mapping in psb_m_userapproleaccess.
        </div>
      ) : null}

      <Row className="g-3 align-items-stretch">
        <Col lg={4}>
          <Card className="profile-social-card border-0 shadow-sm h-100">
            <Card.Body>
              <div className="profile-avatar">{initials}</div>
              <h3 className="profile-name mb-1">{fullName}</h3>
              <p className="profile-handle mb-2">@{getValue(profile.username, "unknown")}</p>
              <Badge bg="light" text="dark" className="profile-status-badge">
                {statusLabel}
              </Badge>

              <div className="profile-org-lines mt-3">
                <p className="mb-1">{companyLabel}</p>
                <p className="mb-0">{departmentLabel}</p>
              </div>

              <div className="mt-4">
                <p className="mb-1 text-muted">Administrator Contact</p>
                <p className="mb-0 fw-semibold">
                  {adminEmail || "Administrator Email Not Available"}
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={8}>
          <Card className="profile-summary-card border-0 shadow-sm mb-3">
            <Card.Body>
              <p className="profile-section-kicker mb-1">My PSB</p>
              <h4 className="mb-1">Profile Snapshot</h4>
              <p className="text-muted mb-3">
                Your account details are visible here for quick reference.
              </p>

              <Row className="g-2">
                <Col sm={6}>
                  <div className="profile-detail-tile">
                    <p className="profile-detail-label mb-1">Email</p>
                    <p className="profile-detail-value mb-0">{getValue(profile.email)}</p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile">
                    <p className="profile-detail-label mb-1">Phone</p>
                    <p className="profile-detail-value mb-0">{getValue(profile.phone)}</p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile">
                    <p className="profile-detail-label mb-1">Address</p>
                    <p className="profile-detail-value mb-0">{getValue(profile.address)}</p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile">
                    <p className="profile-detail-label mb-1">Role</p>
                    <p className="profile-detail-value mb-0">{roleSummary}</p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile">
                    <p className="profile-detail-label mb-1">Session User</p>
                    <p className="profile-detail-value mb-0">
                      {session?.username || session?.email || "Unknown"}
                    </p>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="profile-detail-tile">
                    <p className="profile-detail-label mb-1">Signed In</p>
                    <p className="profile-detail-value mb-0">
                      {session?.loginAt
                        ? new Date(session.loginAt).toLocaleString()
                        : "Unavailable"}
                    </p>
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
              <p className="mb-0">
                Send your request by email and include your username plus the exact changes needed.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

