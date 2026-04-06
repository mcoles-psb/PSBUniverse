"use client";

import Link from "next/link";
import { Container, Card } from "react-bootstrap";

export default function TravelPage() {
  return (
    <Container className="py-4" style={{ maxWidth: 800 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href="/" className="back-link me-3">
          ← Back
        </Link>
        <h2 className="mb-0">Travel Time</h2>
      </div>
      <Card>
        <Card.Body className="text-center py-5 text-muted">
          <h4>Coming Soon</h4>
          <p>Travel time and route planning calculations are under development.</p>
        </Card.Body>
      </Card>
    </Container>
  );
}
