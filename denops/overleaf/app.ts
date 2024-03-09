import { Denops } from "./deps.ts";
import { BaseAPI, Identity, ProjectPersist } from "./api/base.ts";
import { Context } from "./context.ts";
import { GlobalStateManager } from "./utils/globalStateManager.ts";
import { SocketIOAPI, UpdateSchema } from "./api/socketio.ts";
import { globals } from "https://deno.land/x/denops_std@v6.0.1/variable/mod.ts";
import { ensure, is } from "./deps.ts";
import { FileEntity, FileType, ProjectEntity } from "./types.ts";

class OverleafApp {
  private root?: ProjectEntity;
  private context: Context;
  private api?: BaseAPI;
  private socket?: SocketIOAPI;
  private publicId = "";
  private userId = "";
  private isDirty = false;
  private initializing?: Promise<ProjectEntity>;
  private retryConnection = 0;
  private denops: Denops;
  private projectName = "";
  private projectId = "";
  private serverName = "overleaf";

  constructor(denops: Denops, context: Context) {
    this.context = context;
    const res = GlobalStateManager.initSocketIOAPI(
      this.context,
      this.serverName,
      this.projectId,
    );
    this.denops = denops;
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
    if (!this.initializing) {
      this.initializing = this.initializingPromise;
    }
    return this.initializing;
  }

  async getProjectId(identity: Identity, projectName: string) {
    if (this.api === undefined) {
      throw new Error("API is not initialized");
    }
    const projects = await this.api.getProjectsJson(identity);
    let projectInfo: ProjectPersist = {} as ProjectPersist;
    for (const project of projects.projects!) {
      if (project.name === projectName) {
        projectInfo = project;
      }
    }
    if (projectInfo === ({} as ProjectPersist)) {
      throw new Error(`Project ${projectName} not found`);
    }
    return projectInfo.id;
  }

  private get initializingPromise(): Promise<ProjectEntity> {
    if (this.retryConnection >= 3) {
      this.retryConnection = 0;
      console.log("Failed to connect to Overleaf");
      throw new Error("Failed to connect to Overleaf");
    }
    if (this.socket === undefined || this.api === undefined) {
      throw new Error("API is not initialized");
    }
    if (this.retryConnection > 0) {
      this.socket.init();
    }
    this.remoteWatch();
    this.root = undefined;
    return this.socket
      .joinProject(this.projectId)
      .then(async (project) => {
        const identity = await GlobalStateManager.authenticate(
          this.context,
          this.serverName,
        );
        if (this.socket === undefined || this.api === undefined) {
          throw new Error("API is not initialized");
        }
        project.settings = (
          await this.api.getProjectSettings(identity, this.projectId)
        ).settings!;
        this.root = project;
        return project;
      })
      .catch((err) => {
        console.log(err);
        this.retryConnection += 1;
        return this.initializingPromise;
      });
  }

  private remoteWatch(): void {
    if (this.socket === undefined) {
      throw new Error("API is not initialized");
    }
    this.socket.updateEventHandlers({
      onDisconnected: () => {
        if (this.root === undefined) {
          return;
        }
        console.log("Disconncted");
        this.retryConnection += 1;
        this.initializing = this.initializingPromise;
      },
      onConnectionAccepted: (publicId: string) => {
        this.retryConnection = 0;
        this.publicId = publicId;
      },
      onFileCreated: (
        parentFolderId: string,
        type: FileType,
        entity: FileEntity,
      ) => {
        console.log("File Created");
        console.log(parentFolderId);
        console.log(type);
        console.log(entity);
      },
      onFileRenamed: (entityId: string, newName: string) => {
        console.log("File Renamed");
        console.log(entityId);
        console.log(newName);
      },
      onFileRemoved: (entityId: string) => {
        console.log("File Removed");
        console.log(entityId);
      },
      onFileMoved: (entityId: string, folderId: string) => {
        console.log("File Moved");
        console.log(entityId);
        console.log(folderId);
      },
      onFileChanged: (update: UpdateSchema) => {
        console.log("File Changed");
        console.log(update);
      },
      onSpellChecLanguageUpdated: (language: string) => {
        if (this.root) {
          this.root.spellCheckLanguage = language;
        }
      },
      onCompilerUpdated: (compiler: string) => {
        if (this.root) {
          this.root.compiler = compiler;
        }
      },
    });
  }
}

export async function main(denops: Denops): Promise<void> {
  const context = new Context();
  const url = "https://www.overleaf.com/";
  const cookie = Deno.env.get("OVERLEAF_COOKIE") as string;
  const api = new BaseAPI(url);
  const auth = { cookies: cookie };
  await GlobalStateManager.loginServer(context, api, "overleaf", auth);
  const app = new OverleafApp(denops, context);
  await app.init();
}
