"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import {
  cacheReferenceData,
  cacheSessionData,
  clearSessionCache,
  getCachedJson,
  USER_MASTER_CACHE_KEYS,
  USER_MASTER_CACHE_TTL,
} from "@/modules/user-master/cache/user-master.cache";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [appKey, setAppKey] = useState("admin-config");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
          appKey: appKey || null,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Login failed");
      }

      clearSessionCache(appKey || "global");

      cacheSessionData({
        session: payload.session,
        user: payload.user,
        access: payload.access,
        appKey: appKey || "global",
      });

      try {
        const bootstrap = await getCachedJson({
          key: USER_MASTER_CACHE_KEYS.bootstrap,
          url: "/api/user-master/bootstrap",
          ttlMs: USER_MASTER_CACHE_TTL.refsMs,
          forceFresh: true,
          allowStaleOnError: false,
        });
        cacheReferenceData(bootstrap);
      } catch {
        // Login should still succeed even if reference-cache warmup fails.
      }

      const shouldOpenAdmin =
        payload?.access?.isDevMain ||
        payload?.access?.permissions?.update ||
        payload?.access?.roleKeys?.includes?.("admin");

      router.push(shouldOpenAdmin ? "/setup/admin" : "/profile");
    } catch (error) {
      setMessage(error?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container className="py-5" style={{ maxWidth: 980 }}>
      <Row className="justify-content-center">
        <Col md={7} lg={6}>
          <Card className="shadow-sm">
            <Card.Body className="p-4">
              <div className="mb-3">
                <h2 className="mb-1">User Master Login</h2>
                <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
                  Authenticate against psb_s_user and load role-based access from
                  psb_m_userappproleaccess.
                </p>
              </div>

              {message ? <Alert variant="danger">{message}</Alert> : null}

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Username or Email</Form.Label>
                  <Form.Control
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="Enter username or email"
                    autoComplete="username"
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label>Application Context (Optional)</Form.Label>
                  <Form.Control
                    value={appKey}
                    onChange={(event) => setAppKey(event.target.value)}
                    placeholder="Example: admin-config"
                  />
                </Form.Group>

                <div className="d-flex gap-2">
                  <Button type="submit" variant="primary" disabled={submitting}>
                    {submitting ? "Signing in..." : "Sign In"}
                  </Button>
                  <Link href="/" className="btn btn-outline-secondary">
                    Cancel
                  </Link>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

