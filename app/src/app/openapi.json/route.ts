import { buildOpenApi } from "@/lib/seo/openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(buildOpenApi(), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
