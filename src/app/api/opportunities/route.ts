import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { validateOpportunityFields } from "@/lib/opportunity-validation";
import {
  createOpportunity,
  listOpportunities,
} from "@/lib/repositories/opportunities";

export const runtime = "nodejs";

function validate(body: Record<string, unknown>) {
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    typeof body.client_id !== "string" ||
    typeof body.contact_id !== "string"
  )
    return "Informe nome, cliente e contato.";
  return validateOpportunityFields(body);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    return NextResponse.json(
      await listOpportunities(
        searchParams.get("q")?.trim() || null,
        searchParams.get("client_id") || null,
        searchParams.get("status") || null,
      ),
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar as oportunidades." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject<Record<string, unknown>>(request, {
    error: "Corpo JSON inválido.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const error = validate(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const created = await createOpportunity(body);
    if (!created)
      return NextResponse.json(
        { error: "Cliente ativo ou contato válido não encontrado." },
        { status: 400 },
      );
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível cadastrar a oportunidade." },
      { status: 400 },
    );
  }
}
