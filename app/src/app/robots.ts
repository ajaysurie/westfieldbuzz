import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/account"],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
