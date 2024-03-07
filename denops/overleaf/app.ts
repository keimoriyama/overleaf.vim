import { Denops } from "./deps.ts";
import { BaseAPI, Identity, ProjectPersist } from "./api/base.ts";
import { Context } from "./context.ts";
import { GlobalStateManager } from "./utils/globalStateManager.ts";
import { SocketIOAPI } from "./api/socketio.ts";
import { globals } from "https://deno.land/x/denops_std@v6.0.1/variable/mod.ts";
import { ensure, is } from "./deps.ts";
import { ProjectEntity } from "./types.ts";

class OverleafApp {
  private root: ProjectEntity;
  private context: Context;
  private api: BaseAPI;
  private socket: SocketIOAPI;
  private publicId: string;
  private userId: string;
  private isDirty: boolean;
  private initializing?: Promise<ProjectEntity>;
  private retryConnection: number = 0;
  private denops: Denops;
  private projectName: string = "";
  private projectId: string = "";
  private serverName: string = "overleaf";

  constructor(denops: Denops, context: Context) {
    this.context = context;
    this.denops = denops;
    const res = GlobalStateManager.initSocketIOAPI(
      this.context,
      this.serverName,
      this.projectId,
    );

    if (res) {
      this.api = res.api;
      this.socket = res.socket;
    }
  }
  async init() {
    this.projectName = await globals.get(this.denops, "overleaf_project_name");
    const identity = await GlobalStateManager.authenticate(
      this.context,
      this.serverName,
    );
    this.projectId = await this.getProjectId(identity, this.projectName);
  }

  async getProjectId(identity: Identity, projectName: string) {
    const projects = await this.api.getProjectsJson(identity);
    let projectInfo: ProjectPersist;
    for (const project of projects.projects!) {
      if (project.name === projectName) {
        projectInfo = project;
      }
    }
    return projectInfo.id;
  }
}

export async function main(denops: Denops): Promise<void> {
  const url = "https://www.overleaf.com/";
  const context = new Context();
  const serverName = "overleaf";
  const cookie = Deno.env.get("OVERLEAF_COOKIE") as string;
  const api = new BaseAPI(url);
  const auth = { cookies: cookie };
  await GlobalStateManager.loginServer(context, api, "overleaf", auth);
  const identity = await GlobalStateManager.authenticate(context, serverName);
  let projectName: string = await globals.get(denops, "overleaf_project_name");
  console.log(projectName);
  projectName = ensure(projectName, is.String);
  const app = new OverleafApp(denops, context);
}
