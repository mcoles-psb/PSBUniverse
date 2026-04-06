import AppLayout from "@/shared/components/layout/AppLayout";

export default function ProtectedLayout({ children }) {
  return <AppLayout>{children}</AppLayout>;
}
