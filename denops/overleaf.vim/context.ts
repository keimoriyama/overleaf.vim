import { ServerPersist } from "./utils/globalStateManager.ts";

export class Context {
  public globalState: { [name: string]: ServerPersist };
  public constructor() {
    this.globalState = {
      overleaf: {
        name: "www.overleaf.com",
        url: "https://www.overleaf.com",
        login: undefined,
      },
    };
  }
}
