import "./globals.css";
import AuthShell from "@/components/AuthShell";

export const metadata = {
  title: "PSBUniverse",
  description: "PSBUniverse application workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  );
}
