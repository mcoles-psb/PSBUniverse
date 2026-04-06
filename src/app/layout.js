import "./globals.css";

export const metadata = {
  title: "PSBUniverse",
  description: "PSBUniverse application workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
