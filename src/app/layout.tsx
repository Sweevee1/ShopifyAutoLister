import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shopify Auto-Lister",
  description: "Generate Shopify product descriptions from a barcode",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('dark_mode')==='true')document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body className="bg-gray-50 dark:bg-gray-950 min-h-screen">{children}</body>
    </html>
  );
}
