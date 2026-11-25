import { NextRequest, NextResponse } from "next/server";
import { isLeadStatus } from "@/lib/lead-status";
import { listLeads } from "@/lib/repositories/leads";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const search = params.get("search")?.trim() || null;
    const status = params.get("status") || null;
    if (status && !isLeadStatus(status))
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    return NextResponse.json(await listLeads(search, status));
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar os leads." },
      { status: 400 },
    );
  }
}
