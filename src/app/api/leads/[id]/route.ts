import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { isLeadStatus } from "@/lib/lead-status";
import { validateLeadUpdate } from "@/lib/lead-validation";
import { getLead, updateLead } from "@/lib/repositories/leads";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const lead = await getLead(id);
    if (!lead)
      return NextResponse.json(
        { error: "Lead não encontrado." },
        { status: 404 },
      );
    return NextResponse.json(lead);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar o lead." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = await readJsonObject(request, {
    error: "Corpo JSON inválido.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;

  try {
    const current = await getLead(id);
    if (!current)
      return NextResponse.json(
        { error: "Lead não encontrado." },
        { status: 404 },
      );

    if (!isLeadStatus(String(current.status)))
      return NextResponse.json(
        { error: "Status atual do lead é inválido." },
        { status: 500 },
      );

    const error = validateLeadUpdate(
      { status: current.status },
      parsed.body,
    );
    if (error) return NextResponse.json({ error }, { status: 400 });

    const updated = await updateLead(id, parsed.body);
    if (!updated)
      return NextResponse.json(
        { error: "Lead não encontrado." },
        { status: 404 },
      );
    return NextResponse.json(updated);
  } catch (reason) {
    if (isConstraintViolation(reason))
      return NextResponse.json(
        { error: "Dados inválidos para o lead." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Não foi possível salvar o lead." },
      { status: 500 },
    );
  }
}
