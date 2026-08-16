import "./globals.css";

export const metadata = {
  title: "Brothers  Pharmacy — Inventory System",
  description: "Pharmacy inventory management application",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&family=Inter:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased h-full">
        {children}
      </body>
    </html>
  );
}