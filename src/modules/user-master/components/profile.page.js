"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  Row,
} from "react-bootstrap";
import {
  cacheReferenceData,
  cacheSessionData,
  getCachedJson,
  invalidateUserMasterCache,
  USER_MASTER_CACHE_KEYS,
  USER_MASTER_CACHE_TTL,
} from "@/modules/user-master/cache/user-master.cache";

function getLabel(record, preferredFields = []) {
  const candidates = [
    ...preferredFields,
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

function asSelectValue(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function toNullableNumber(value) {
  if (value === "" || value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function UserProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [session, setSession] = useState(null);
  const [access, setAccess] = useState(null);
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
    password: "",
  });

  const loadProfile = useCallback(async (options = {}) => {
    const forceFresh = Boolean(options.forceFresh);
    setLoading(true);
    setMessage("");

    try {
      const [sessionPayload, profilePayload, bootstrapPayload] = await Promise.all([
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

      cacheSessionData({
        session: sessionPayload.session,
        user: profilePayload.user,
        access: sessionPayload.access,
      });

      cacheReferenceData(bootstrapPayload);

      setSession(sessionPayload.session || null);
      setAccess(sessionPayload.access || null);
      setReferences({
        companies: bootstrapPayload.companies || [],
        departments: bootstrapPayload.departments || [],
        statuses: bootstrapPayload.statuses || [],
      });

      const user = profilePayload.user || {};
      setProfile({
        username: user.username || "",
        email: user.email || "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone: user.phone || "",
        address: user.address || "",
        comp_id: asSelectValue(user.comp_id),
        dept_id: asSelectValue(user.dept_id),
        status_id: asSelectValue(user.status_id),
        password: "",
      });
    } catch (error) {
      setMessage(error?.message || "Unable to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const departmentOptions = useMemo(() => {
    if (!profile.comp_id) return references.departments;
    return references.departments.filter(
      (dept) => String(dept.comp_id) === String(profile.comp_id)
    );
  }, [profile.comp_id, references.departments]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/user-master/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: profile.username,
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone: profile.phone,
          address: profile.address,
          comp_id: toNullableNumber(profile.comp_id),
          dept_id: toNullableNumber(profile.dept_id),
          status_id: toNullableNumber(profile.status_id),
          ...(profile.password ? { password: profile.password } : {}),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to update profile");
      }

      invalidateUserMasterCache([
        USER_MASTER_CACHE_KEYS.profile,
        USER_MASTER_CACHE_KEYS.session,
      ]);

      setMessage("Profile updated.");
      await loadProfile({ forceFresh: true });
    } catch (error) {
      setMessage(error?.message || "Unable to update profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Container className="py-4">Loading profile...</Container>;
  }

  return (
    <Container className="py-4" style={{ maxWidth: 1050 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href="/" className="back-link me-3">
          â† Back
        </Link>
        <div>
          <h2 className="mb-0">User Profile</h2>
          <p className="text-muted mb-0" style={{ fontSize: "0.86rem" }}>
            Data source: psb_s_user with company/department/status references.
          </p>
        </div>
      </div>

      {message ? (
        <Alert variant={message.toLowerCase().includes("updated") ? "success" : "danger"}>
          {message}
        </Alert>
      ) : null}

      {access && !access.hasAccess ? (
        <Alert variant="warning" className="mb-3">
          Your account has no role mapping in psb_m_userappproleaccess.
        </Alert>
      ) : null}

      <Card className="shadow-sm">
        <Card.Body>
          <Form onSubmit={saveProfile}>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Username</Form.Label>
                  <Form.Control
                    value={profile.username}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, username: event.target.value }))
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={profile.email}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, email: event.target.value }))
                    }
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>First Name</Form.Label>
                  <Form.Control
                    value={profile.first_name}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, first_name: event.target.value }))
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Last Name</Form.Label>
                  <Form.Control
                    value={profile.last_name}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, last_name: event.target.value }))
                    }
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>Phone</Form.Label>
                  <Form.Control
                    value={profile.phone}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, phone: event.target.value }))
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Address</Form.Label>
                  <Form.Control
                    value={profile.address}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, address: event.target.value }))
                    }
                  />
                </Form.Group>
              </Col>

              <Col md={4}>
                <Form.Group>
                  <Form.Label>Company</Form.Label>
                  <Form.Select
                    value={profile.comp_id}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        comp_id: event.target.value,
                        dept_id: "",
                      }))
                    }
                  >
                    <option value="">Select company...</option>
                    {references.companies.map((company) => (
                      <option key={String(company.comp_id)} value={String(company.comp_id)}>
                        {getLabel(company, ["comp_name", "company_name"])}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col md={4}>
                <Form.Group>
                  <Form.Label>Department</Form.Label>
                  <Form.Select
                    value={profile.dept_id}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, dept_id: event.target.value }))
                    }
                  >
                    <option value="">Select department...</option>
                    {departmentOptions.map((department) => (
                      <option
                        key={String(department.dept_id)}
                        value={String(department.dept_id)}
                      >
                        {getLabel(department, ["dept_name", "department_name"])}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col md={4}>
                <Form.Group>
                  <Form.Label>Status</Form.Label>
                  <Form.Select
                    value={profile.status_id}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, status_id: event.target.value }))
                    }
                  >
                    <option value="">Select status...</option>
                    {references.statuses.map((status) => (
                      <option key={String(status.status_id)} value={String(status.status_id)}>
                        {getLabel(status, ["status_name"])}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group>
                  <Form.Label>New Password (Optional)</Form.Label>
                  <Form.Control
                    type="password"
                    value={profile.password}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, password: event.target.value }))
                    }
                    autoComplete="new-password"
                    placeholder="Leave blank to keep current password"
                  />
                </Form.Group>
              </Col>
              <Col md={6} className="d-flex align-items-end">
                <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                  Session user: {session?.username || session?.email || "Unknown"}
                </div>
              </Col>
            </Row>

            <div className="mt-4 d-flex gap-2">
              <Button type="submit" variant="success" disabled={saving}>
                {saving ? "Saving..." : "Save Profile"}
              </Button>
              <Button
                type="button"
                variant="outline-secondary"
                onClick={() => loadProfile({ forceFresh: true })}
              >
                Refresh
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}

