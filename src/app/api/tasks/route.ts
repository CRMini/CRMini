import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { createTask, listTasks } from "@/lib/repositories/tasks";
import { saoPauloDayRange } from "@/lib/task-date";
import { validateTask } from "@/lib/task-validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const day = params.get("date");
    const range = day ? saoPauloDayRange(day) : null;
    const status = params.get("status");
    if (status && !["Aberto", "Concluído"].includes(status))
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    return NextResponse.json(
      await listTasks(range?.start ?? null, range?.end ?? null, status),
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar as tarefas." },
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
  const body = parsed.body;
  const error = validateTask(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const created = await createTask(body);
    if (!created)
      return NextResponse.json(
        { error: "Cliente ativo ou contato válido não encontrado." },
        { status: 400 },
      );
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível cadastrar a tarefa." },
      { status: 400 },
    );
  }
}
