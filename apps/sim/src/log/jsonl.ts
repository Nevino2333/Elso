import { createWriteStream } from "node:fs";
import type { TickLog } from "@elso/shared";

export function createJsonlWriter(path: string) {
  const stream = createWriteStream(path, { flags: "w" });
  return {
    write(log: TickLog) {
      stream.write(JSON.stringify(log) + "\n");
    },
    close() {
      stream.end();
    },
  };
}