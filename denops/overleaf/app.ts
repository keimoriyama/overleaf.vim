import { Denops } from "./deps.ts";
import { BaseAPI, Identity, ProjectPersist } from "./api/base.ts";
import { Context } from "./context.ts";
import { GlobalStateManager } from "./utils/globalStateManager.ts";
import { SocketIOAPI } from "./api/socketio.ts";
import { globals } from "https://deno.land/x/denops_std@v6.0.1/variable/mod.ts";
import { ensure, isString } from "./deps.ts";
import { ProjectEntity } from "./types.ts";

class OverleafApp {
  private root: ProjectEntity;
  private context: Context;
  private api: BaseAPI;
  private socket: SocketIOAPI;
  private publicId: string;
  private userId: string;
  private isDirty: boolean;
  private identity: Identity;
  private initializing?: Promise<ProjectEntity>;
  private retryConnection: number = 0;
  private denops: Denops;
  public readonly projectName: string;
  public readonly serverName: string = "overleaf";
  public readonly projectId: string;

  constructor(denops: Denops, context: Context, identity: Identity) {
    this.projectName = ensure(
      await globals.get(this.denops, "overleaf_project_name"),
      isString,
    );
    this.identity = identity;
    this.context = context;
    this.denops = denops;
    this.projectId = await this.getProjectId(this.identity, this.projectName);
  }

  async getProjectId(identity: Identity, projectName: string) {
    const projects = await this.api.getProjectsJson(identity);
    let projectInfo: ProjectPersist;
    for (const project of projects.projects!) {
      if (project.name === projectName) {
        projectInfo = project;
      }
    }
    if (!projectInfo.id) {
      // ここのメッセージは要検討
      throw new Error(`Project ${projectName} not found.`);
    }
    return projectInfo.id;
  }
}
export async function main(denops: Denops): void {
  console.log("Hello, world!");
  const url = "https://www.overleaf.com/";
  const api = new BaseAPI(url);
  const context = new Context();
  const serverName = "overleaf";
  const cookie = Deno.env.get("OVERLEAF_COOKIE") as string;
  const auth = { cookies: cookie };
  const _res = await GlobalStateManager.loginServer(
    context,
    api,
    "overleaf",
    auth,
  );
  const identity = await GlobalStateManager.authenticate(context, serverName);
  const projects = await api.getProjectsJson(identity);
  let projectId = "";
  for (const project of projects.projects!) {
    if (project.name === "イラレ用数式") {
      projectId = project.id;
    }
  }
}
