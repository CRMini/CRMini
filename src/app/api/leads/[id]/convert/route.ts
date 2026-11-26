import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { validateLeadConversion } from "@/lib/lead-validation";
import { convertLead, getLead } from "@/lib/repositories/leads";

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

export async function POST(
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
    const lead = await getLead(id);
    if (!lead)
      return NextResponse.json(
        { error: "Lead não encontrado." },
        { status: 404 },
      );

    const error = validateLeadConversion(lead, parsed.body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const converted = await convertLead(id, parsed.body);
    if (!converted)
      return NextResponse.json(
        { error: "O lead não pode mais ser convertido." },
        { status: 409 },
      );

    return NextResponse.json(converted, { status: 201 });
  } catch (reason) {
    if (isConstraintViolation(reason))
      return NextResponse.json(
        { error: "Dados inválidos para a oportunidade." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Não foi possível converter o lead." },
      { status: 500 },
    );
  }
}
