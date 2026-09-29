/**
 * Public origin for every URL we publish (sitemap, canonical links, JSON-LD,
 * API `url` fields). Vercel serves www and redirects the apex to it, so
 * publishing the apex would cost crawlers and agents a redirect per fetch.
 */
export const SITE_ORIGIN = "https://www.westfieldbuzz.com";
