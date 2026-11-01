import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { createClient, listClients, listClientOptions } from "@/lib/repositories/clients";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const compact = ["1", "true"].includes(
      request.nextUrl.searchParams.get("compact") || "",
    );
    if (compact) {
      const includeInactive = ["1", "true"].includes(
        request.nextUrl.searchParams.get("include_inactive") || "",
      );
      return NextResponse.json(await listClientOptions(includeInactive));
    }
    const search = request.nextUrl.searchParams.get("q")?.trim();
    return NextResponse.json(await listClients(search || null));
  } catch (error) {
    console.error("Failed to list clients", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os clientes." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.company_name !== "string" || !body.company_name.trim())
    return NextResponse.json(
      { error: "Informe o nome da empresa." },
      { status: 400 },
    );
  try {
    const client = await createClient(body);
    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("Failed to create client", error);
    return NextResponse.json(
      { error: "Não foi possível cadastrar o cliente." },
      { status: 500 },
    );
  }
}
