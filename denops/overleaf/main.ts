import { Denops } from "./deps.ts";
import { execute } from "https://deno.land/x/denops_std@v1.0.0/helper/mod.ts";
import { main as appMain } from "./app.ts";
export async function main(denops: Denops): Promise<void> {
  // ここにプラグインの処理を記載する
  denops.dispatcher = {
    async startOverleaf() {
      await appMain(denops);
    },
  };
}
