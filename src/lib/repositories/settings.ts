import { getRepositories } from "./registry";

export function getUserName(): Promise<string | null> {
  return getRepositories().settings.getUserName();
}

export function saveUserName(name: string | null): Promise<void> {
  return getRepositories().settings.saveUserName(name);
}
