import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { isLeadReferenceType } from "@/lib/lead-references";
import {
  createLeadReference,
  listLeadReferences,
} from "@/lib/repositories/leads";

export const runtime = "nodejs";

const NAME_MAX_LENGTH = 80;

export async function GET() {
  try {
    return NextResponse.json(await listLeadReferences());
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar as opções." },
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

  const { type, name } = parsed.body;
  if (typeof type !== "string" || !isLeadReferenceType(type))
    return NextResponse.json(
      { error: "Tipo de opção inválido." },
      { status: 400 },
    );

  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed)
    return NextResponse.json(
      { error: "Informe o nome da opção." },
      { status: 400 },
    );
  if (trimmed.length > NAME_MAX_LENGTH)
    return NextResponse.json(
      { error: `O nome da opção deve ter no máximo ${NAME_MAX_LENGTH} caracteres.` },
      { status: 400 },
    );

  try {
    const reference = await createLeadReference(type, trimmed);
    if (!reference)
      return NextResponse.json(
        { error: "Essa opção já existe." },
        { status: 409 },
      );
    return NextResponse.json(reference, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível salvar a opção." },
      { status: 500 },
    );
  }
}
