import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import {
  deactivateClient,
  getClient,
  updateClient,
} from "@/lib/repositories/clients";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await getClient(id);
    if (!result.found)
      return NextResponse.json(
        { error: "Cliente não encontrado." },
        { status: 404 },
      );
    return NextResponse.json(result.client);
  } catch {
    return NextResponse.json(
      { error: "Erro ao consultar cliente." },
      { status: 503 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.company_name !== "string" || !body.company_name.trim())
    return NextResponse.json(
      { error: "Informe o nome da empresa." },
      { status: 400 },
    );
  try {
    const result = await updateClient(id, body);
    if (!result)
      return NextResponse.json(
        { error: "Cliente não encontrado." },
        { status: 404 },
      );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to update client", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar o cliente." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await deactivateClient(id);
    if (!result.found)
      return NextResponse.json(
        { error: "Cliente não encontrado." },
        { status: 404 },
      );
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível desativar o cliente." },
      { status: 500 },
    );
  }
}
