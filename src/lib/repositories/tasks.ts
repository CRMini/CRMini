import { getRepositories } from "./registry";

export function listTasks(
  start: string | null,
  end: string | null,
  status: string | null,
): Promise<Record<string, any>[]> {
  return getRepositories().tasks.listTasks(start, end, status);
}

export function createTask(
  body: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  return getRepositories().tasks.createTask(body);
}

export function updateTaskStatus(
  id: string,
  status: unknown,
): Promise<Record<string, any> | null> {
  return getRepositories().tasks.updateTaskStatus(id, status);
}
