"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Container, Card, Form, Button, Row, Col, Alert } from "react-bootstrap";
import { supabase } from "@/lib/supabase";

export default function CompanyProfilePage() {
  const [profile, setProfile] = useState({
    email: "Sales.pgd@premiumsteelgroup.com",
    phone: "817-502-2520",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadProfile() {
    const { data } = await supabase
      .from("PSB_S_Company")
      .select("*")
      .limit(1)
      .single();
    if (data) {
      setProfile({ email: data.email || "", phone: data.phone || "" });
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
    setMessage("");

    const { error: delError } = await supabase
      .from("PSB_S_Company")
      .delete()
      .gte("id", 0);

    const { error } = await supabase
      .from("PSB_S_Company")
      .insert([{ email: profile.email, phone: profile.phone }]);

    setMessage(
      error || delError
        ? "Error saving: " + (error || delError).message
        : "Profile saved."
    );
    setSaving(false);
  };

  return (
    <Container className="py-4" style={{ maxWidth: 700 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href="/" className="back-link me-3">
          ← Back
        </Link>
        <div>
          <h2 className="mb-0">Company Profile</h2>
          <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>
            Update company contact details used across the app
          </p>
        </div>
      </div>

      {message && (
        <Alert
          variant={message.includes("Error") ? "danger" : "success"}
          dismissible
          onClose={() => setMessage("")}
        >
          {message}
        </Alert>
      )}

      <Card>
        <Card.Body>
          <Row className="g-3">
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
            <Button variant="outline-secondary" onClick={loadProfile}>
              Reset
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Card className="mt-3">
        <Card.Header className="fw-bold">Preview</Card.Header>
        <Card.Body>
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
