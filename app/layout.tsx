import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitSimilar — Find similar GitHub repositories",
  description:
    "Paste a GitHub repo and discover similar projects, powered by AI + GitHub search.",
  openGraph: {
    title: "GitSimilar — Find similar GitHub repositories",
    description: "Paste a GitHub repo and discover similar projects.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
