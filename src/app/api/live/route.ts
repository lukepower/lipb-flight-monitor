import { fetchLiveTraffic } from "@/lib/opensky";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await fetchLiveTraffic();
  return Response.json(data);
}
