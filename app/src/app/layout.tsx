import type { Metadata } from "next";
import { Instrument_Serif, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Providers from "@/components/Providers";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://westfieldbuzz.com"),
  title: {
    default: "Westfield Buzz — The neighbors' guide to everything local",
    template: "%s | Westfield Buzz",
  },
  description:
    "A community-curated directory of Westfield's most trusted service providers. Real recommendations from the people who live here.",
  openGraph: {
    title: "Westfield Buzz",
    description:
      "A community-curated directory of Westfield's most trusted service providers. Real recommendations from real neighbors.",
    type: "website",
    locale: "en_US",
    siteName: "Westfield Buzz",
  },
  twitter: {
    card: "summary_large_image",
    title: "Westfield Buzz",
    description:
      "A community-curated directory of Westfield's most trusted service providers.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Westfield Buzz",
      url: "https://westfieldbuzz.com",
      description:
        "A community-curated directory of Westfield's most trusted service providers.",
    },
    {
      "@type": "Organization",
      name: "Westfield Buzz",
      url: "https://westfieldbuzz.com",
      areaServed: {
        "@type": "City",
        name: "Westfield",
        addressRegion: "NJ",
        addressCountry: "US",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${dmSans.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <Providers>
          <Nav />
          <main className="pt-[60px]">{children}</main>
          <Footer />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
