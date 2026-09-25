import { existsSync } from "node:fs";
import path from "node:path";

/** Loads the project-root .env (next to compose.yaml) without overriding existing vars. */
export function loadEnv() {
  const file = path.resolve(import.meta.dirname, "../../.env");
  if (existsSync(file)) process.loadEnvFile(file);
}
