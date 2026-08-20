import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/account", "/directory", "/suggest"],
      },
    ],
    sitemap: "https://westfieldbuzz.com/sitemap.xml",
  };
}
