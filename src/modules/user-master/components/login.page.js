"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import {
  cacheReferenceData,
  cacheSessionData,
  clearSessionCache,
  getCachedJson,
  USER_MASTER_CACHE_KEYS,
  USER_MASTER_CACHE_TTL,
} from "@/modules/user-master/cache/user-master.cache";
import { toastError, toastSuccess, toastWarning } from "@/shared/utils/toast";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function mapLoginError(errorMessage) {
    const text = String(errorMessage || "").toLowerCase();

    if (text.includes("incorrect") || text.includes("invalid")) {
      return "Username/email or password is incorrect.";
    }

    if (text.includes("account is inactive") || text.includes("status does not allow")) {
      return "Your account is not ready for sign in. Please contact your administrator.";
    }

    if (text.includes("required")) {
      return "Please enter both username/email and password.";
    }

    if (String(errorMessage || "").trim()) {
      return String(errorMessage);
    }

    return "Unable to sign in right now. Please try again.";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Login failed");
      }

      clearSessionCache("global");

      cacheSessionData({
        session: payload.session,
        user: payload.user,
        access: payload.access,
        appKey: "global",
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

      if (payload?.limitedAccess || payload?.access?.hasAccess === false) {
        toastWarning(
          "Signed in with limited access. Please contact your administrator for app access.",
          "Limited Access",
          { durationMs: 5000 }
        );
      } else {
        toastSuccess("Welcome to PSBUniverse. You have signed in successfully.", "Sign In Success");
      }

      router.push("/profile");
    } catch (error) {
      toastError(mapLoginError(error?.message), "Sign In Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-login-shell">
      <Container className="py-4 py-lg-5" style={{ maxWidth: 1080 }}>
        <Row className="justify-content-center">
          <Col xl={10} lg={11}>
            <Card className="portal-login-card border-0">
              <Card.Body className="p-0">
                <Row className="g-0">
                  <Col lg={5} className="portal-login-welcome">
                    <p className="portal-brand-kicker mb-2">Welcome To</p>
                    <h1 className="portal-brand-name mb-2">PSBUniverse</h1>
                    <p className="portal-brand-copy mb-3">
                      A simple workspace for your daily projects, quotes, and updates.
                    </p>
                    <p className="portal-brand-sub mb-0">Please sign in to continue.</p>
                  </Col>

                  <Col lg={7} className="portal-login-form-wrap">
                    <div className="portal-login-form-inner">
                      <div className="mb-3">
                        <h2 className="mb-1">Sign In</h2>
                        <p className="text-muted mb-0">
                          Use your username/email and password.
                        </p>
                      </div>

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

                        <div className="d-flex gap-2">
                          <Button
                            type="submit"
                            variant="primary"
                            className="portal-signin-btn"
                            disabled={submitting}
                          >
                            {submitting ? "Signing in..." : "Sign In"}
                          </Button>
                        </div>
                      </Form>

                      <p className="portal-support-note mt-3 mb-0">
                        Need help signing in? Please contact your administrator.
                      </p>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

