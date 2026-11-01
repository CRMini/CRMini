import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { updateTaskStatus } from "@/lib/repositories/tasks";
export const runtime = "nodejs";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = await readJsonObject<{ status?: unknown }>(request, {
    error: "Corpo JSON inválido.",
    shapeError: "Status inválido.",
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body || !["Aberto", "Concluído"].includes(String(body.status)))
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  const { id } = await params;
  try {
    const updated = await updateTaskStatus(id, body.status);
    if (!updated)
      return NextResponse.json(
        { error: "Tarefa não encontrada." },
        { status: 404 },
      );
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível atualizar a tarefa." },
      { status: 400 },
    );
  }
}
