"use client";

import { use } from "react";
import GutterProjectForm from "@/modules/gutter/components/gutter-project-form";

export default function GutterProjectEditPage({ params }) {
  const { id } = use(params);
  return <GutterProjectForm mode="edit" projectId={id} />;
}
