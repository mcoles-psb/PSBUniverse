"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Container, Form, Spinner } from "react-bootstrap";
import { setStoredUser } from "@/lib/localAuth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      setErrorMessage("Username is required.");
      setIsSubmitting(false);
      return;
    }

    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: normalizedUsername,
        password,
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setErrorMessage(payload?.error || "Unable to login right now. Please try again.");
      setIsSubmitting(false);
      return;
    }

    setStoredUser(payload.user);

    router.replace("/profile");
  }

  return (
    <Container className="login-wrap">
      <Card className="login-card shadow-sm">
        <Card.Body className="p-4 p-md-5">
          <p className="text-uppercase text-muted fw-semibold mb-1 login-label">PSBUniverse</p>
          <h1 className="fw-bold mb-2">Login</h1>
          <p className="text-muted mb-4">Sign in to continue to PSBUniverse.</p>

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="username">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="password">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Form.Group>

            {errorMessage ? <p className="text-danger mb-3">{errorMessage}</p> : null}

            <Button type="submit" disabled={isSubmitting} className="w-100">
              {isSubmitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Signing in...
                </>
              ) : (
                "Login"
              )}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}
