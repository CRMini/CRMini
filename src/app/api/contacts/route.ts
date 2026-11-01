import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { createContact, listContacts } from "@/lib/repositories/contacts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || null;
  const industry = request.nextUrl.searchParams.get("segment")?.trim() || null;
  try {
    const includeInactive = ["1", "true"].includes(request.nextUrl.searchParams.get("include_inactive") || "");
    return NextResponse.json(await listContacts(query, industry, includeInactive));
  } catch (error) {
    console.error("Failed to list contacts", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os contatos." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject(request, {
    error: "Dados inválidos.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.full_name !== "string" || !body.full_name.trim())
    return NextResponse.json({ error: "Informe o nome do contato." }, { status: 400 });
  if (typeof body.client_id !== "string" || !body.client_id.trim())
    return NextResponse.json({ error: "Selecione um cliente." }, { status: 400 });
  try {
    const contact = await createContact(body);
    if (!contact)
      return NextResponse.json({ error: "Cliente não encontrado ou inativo." }, { status: 404 });
    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("Failed to create contact", error);
    return NextResponse.json({ error: "Não foi possível cadastrar o contato." }, { status: 500 });
  }
}
