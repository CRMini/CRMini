import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import {
  changeOpportunityStatus,
  getOpportunity,
  updateOpportunity,
} from "@/lib/repositories/opportunities";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const opportunity = await getOpportunity(id);
    if (!opportunity)
      return NextResponse.json(
        { error: "Oportunidade não encontrada." },
        { status: 404 },
      );
    return NextResponse.json(opportunity);
  } catch {
    return NextResponse.json(
      { error: "Erro ao consultar oportunidade." },
      { status: 503 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = await readJsonObject<{
    status?: string;
    loss_reason?: string;
  }>(request, {
    error: "Corpo JSON inválido.",
    shapeError: "Status ou motivo de perda inválido.",
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const statuses = [
      "Em andamento",
      "Desenvolvimento",
      "Proposta",
      "Aceite da proposta",
      "Ganha",
      "Perdida",
    ],
    reasons = ["Preço", "Prazo", "Tecnologia", "Solução"];
  if (
    !statuses.includes(String(body.status)) ||
    (body.status === "Perdida"
      ? !reasons.includes(String(body.loss_reason))
      : Boolean(body.loss_reason))
  )
    return NextResponse.json(
      { error: "Status ou motivo de perda inválido." },
      { status: 400 },
    );
  try {
    const { id } = await params;
    const updated = await changeOpportunityStatus(
      id,
      body.status!,
      body.loss_reason || null,
    );
    if (!updated)
      return NextResponse.json(
        { error: "Oportunidade não encontrada." },
        { status: 404 },
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível alterar o status." },
      { status: 400 },
    );
  }
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = await readJsonObject(request, {
    error: "Corpo JSON inválido.",
    shapeError: "Informe nome, cliente e contato.",
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const { id } = await params;
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    !body.client_id ||
    !body.contact_id
  )
    return NextResponse.json(
      { error: "Informe nome, cliente e contato." },
      { status: 400 },
    );
  const statuses = [
      "Em andamento",
      "Desenvolvimento",
      "Proposta",
      "Aceite da proposta",
      "Ganha",
      "Perdida",
    ],
    reasons = ["Preço", "Prazo", "Tecnologia", "Solução"],
    currencies = ["BRL", "USD", "EUR", "PES"];
  if (
    !statuses.includes(String(body.status)) ||
    (body.status === "Perdida"
      ? !reasons.includes(String(body.loss_reason))
      : Boolean(body.loss_reason))
  )
    return NextResponse.json(
      { error: "Status ou motivo de perda inválido." },
      { status: 400 },
    );
  for (const key of ["value", "budget", "project_hours"])
    if (
      body[key] != null &&
      body[key] !== "" &&
      (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)
    )
      return NextResponse.json(
        { error: `O campo ${key} deve ser um número não negativo.` },
        { status: 400 },
      );
  if (
    !currencies.includes(String(body.currency)) ||
    (body.budget_currency && !currencies.includes(String(body.budget_currency)))
  )
    return NextResponse.json({ error: "Moeda inválida." }, { status: 400 });
  try {
    const updated = await updateOpportunity(id, body);
    if (!updated)
      return NextResponse.json(
        { error: "Oportunidade ou associação válida não encontrada." },
        { status: 404 },
      );
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível atualizar a oportunidade." },
      { status: 400 },
    );
  }
}
