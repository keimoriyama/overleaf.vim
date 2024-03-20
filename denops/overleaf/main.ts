import { Denops } from "./deps.ts";
import { main as appMain } from "./app.ts";
export async function main(denops: Denops): Promise<void> {
  // ここにプラグインの処理を記載する
  denops.dispatcher = {
    async startOverleaf() {
      await appMain(denops);
    },
  };
}
