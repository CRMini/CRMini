import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { isLeadStatus } from "@/lib/lead-status";
import { validateLeadCreation } from "@/lib/lead-validation";
import { createLead, listLeads } from "@/lib/repositories/leads";

export const runtime = "nodejs";

function isConstraintViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? "";
  return (
    code.startsWith("SQLITE_CONSTRAINT") ||
    code === "23502" ||
    code === "23503" ||
    code === "23514"
  );
}

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

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject(request, {
    error: "Corpo JSON inválido.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;

  const error = validateLeadCreation(parsed.body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const created = await createLead(parsed.body);
    if (!created)
      return NextResponse.json(
        { error: "Não foi possível cadastrar o lead." },
        { status: 400 },
      );
    return NextResponse.json(created, { status: 201 });
  } catch (reason) {
    if (isConstraintViolation(reason))
      return NextResponse.json(
        { error: "Dados inválidos para o lead." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Não foi possível cadastrar o lead." },
      { status: 500 },
    );
  }
}
