"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Container, Card, Form, Button, Row, Col } from "react-bootstrap";
import { supabase } from "@/infrastructure/supabase/client";
import { createCacheKey, invalidateCacheKeys } from "@/core/cache";
import { getSupabaseSelectWithCache } from "@/core/cache";
import { toastError, toastSuccess } from "@/shared/utils/toast";

const CACHE_NAMESPACE = "psb-universe";
const CACHE_KEYS = {
  companyProfile: createCacheKey("company", "profile"),
};
const COMPANY_TABLE = "psb_s_company";

export default function CompanyProfilePage() {
  const [companyId, setCompanyId] = useState(null);
  const [profile, setProfile] = useState({
    name: "Premium Steel Buildings Inc",
    shortName: "PSB",
    email: "",
    phone: "",
  });
  const [saving, setSaving] = useState(false);

  async function loadProfile(options = {}) {
    const forceFresh = Boolean(options.forceFresh);

    try {
      const response = await getSupabaseSelectWithCache({
        cacheKey: CACHE_KEYS.companyProfile,
        namespace: CACHE_NAMESPACE,
        forceFresh,
        query: {
          table: COMPANY_TABLE,
          select: "comp_id,comp_name,short_name,comp_email,comp_phone",
          orderBy: "comp_id",
          ascending: true,
          limit: 1,
        },
      });

      const data = Array.isArray(response?.data)
        ? response.data[0]
        : response?.data || null;

      if (data) {
        setCompanyId(data.comp_id || null);
        setProfile({
          name: data.comp_name || "Premium Steel Buildings Inc",
          shortName: data.short_name || "PSB",
          email: data.comp_email || "",
          phone: data.comp_phone || "",
        });
      }
    } catch (error) {
      console.error("Failed to load company profile", error);
      toastError("Error loading profile.", "Company Profile");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const saveProfile = async () => {
    setSaving(true);

    const payload = {
      comp_name: profile.name || "Premium Steel Buildings Inc",
      short_name: profile.shortName || "PSB",
      comp_email: profile.email || null,
      comp_phone: profile.phone || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (companyId) {
      const { error } = await supabase
        .from(COMPANY_TABLE)
        .update(payload)
        .eq("comp_id", companyId);

      if (error) {
        toastError("Error saving: " + error.message, "Company Profile");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from(COMPANY_TABLE)
        .insert({
          ...payload,
          created_at: new Date().toISOString(),
        });

      if (error) {
        toastError("Error saving: " + error.message, "Company Profile");
        setSaving(false);
        return;
      }
    }

    invalidateCacheKeys([CACHE_KEYS.companyProfile], {
      namespace: CACHE_NAMESPACE,
    });
    await loadProfile({ forceFresh: true });

    toastSuccess("Profile saved.", "Company Profile");
    setSaving(false);
  };

  return (
    <Container className="py-4" style={{ maxWidth: 700 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href="/" className="back-link me-3">
          <i className="bi bi-arrow-left" aria-hidden="true" /> Back
        </Link>
        <div>
          <h2 className="mb-0">Company Profile</h2>
          <p className="text-muted mb-0">
            Update company contact details used across the app
          </p>
        </div>
      </div>

      <Card>
        <Card.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Company Name</Form.Label>
                <Form.Control
                  value={profile.name}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Short Name</Form.Label>
                <Form.Control
                  value={profile.shortName}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, shortName: e.target.value }))
                  }
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Email</Form.Label>
                <Form.Control
                  value={profile.email}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, email: e.target.value }))
                  }
                />
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Phone</Form.Label>
                <Form.Control
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, phone: e.target.value }))
                  }
                />
              </Form.Group>
            </Col>
          </Row>
          <div className="d-flex gap-2 mt-3">
            <Button variant="success" onClick={saveProfile} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="outline-secondary"
              onClick={() => loadProfile({ forceFresh: true })}
            >
              Reset
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Card className="mt-3">
        <Card.Header className="fw-bold">Preview</Card.Header>
        <Card.Body>
          <p className="mb-1">
            <strong>Company:</strong> {profile.name}
          </p>
          <p className="mb-1">
            <strong>Short Name:</strong> {profile.shortName}
          </p>
          <p className="mb-1">
            <strong>Email:</strong> {profile.email}
          </p>
          <p className="mb-0">
            <strong>Phone:</strong> {profile.phone}
          </p>
        </Card.Body>
      </Card>
    </Container>
  );
}

