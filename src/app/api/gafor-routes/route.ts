import { fetchGaforRoutes } from "@/lib/gafor-routes";

export const dynamic = "force-dynamic";

export async function GET() {
  const bundle = await fetchGaforRoutes();
  return Response.json(bundle, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
    },
  });
}
