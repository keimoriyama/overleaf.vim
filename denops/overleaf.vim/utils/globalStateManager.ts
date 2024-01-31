import { BaseAPI, Identity, ProjectPersist } from "../api/base.ts";
import { SocketIOAPI } from "../api/socketio.ts";
import { ExtendedBaseAPI } from "../api/extendedBase.ts";
import { Context } from "../context.ts";

const keyServerPersists: string = "overleaf-servers";
const keyPdfViewPersists: string = "overleaf-pdf-viewers";

export interface ServerPersist {
  name: string;
  url: string;
  login?: {
    userId: string;
    username: string;
    identity: Identity;
    projects?: ProjectPersist[];
  };
}

export type ServerPersistMap = { [name: string]: ServerPersist };

export interface ProjectSCMPersist {
  enabled: boolean;
  label: string;
  baseUri: string;
  settings: JSON;
}
type ProjectSCMPersistMap = { [name: string]: ProjectSCMPersist };

type PdfViewPersist = {
  frequency: number;
  state: any;
};
type PdfViewPersistMap = { [uri: string]: PdfViewPersist };

type Servers = { server: ServerPersist; api: BaseAPI };

export class GlobalStateManager {
  static getServers(context: Context): Servers[] {
    const persists = context.globalState;
    const servers: Servers[] = Object.values(persists).map((persist: any) => {
      return {
        server: persist,
        api: new BaseAPI(persist.url),
      };
    });

    if (servers.length === 0) {
      const url = new URL("https://www.overleaf.com");
      this.addServer(context, url.host, url.href);
      return this.getServers(context);
    } else {
      return servers;
    }
  }

  static addServer(context: Context, name: string, url: string): boolean {
    const persists = context.globalState;
    if (persists[name] === undefined) {
      persists[name] = { name, url };
      // context.globalState.update(keyServerPersists, persists);
      context.globalState = persists;
      return true;
    } else {
      return false;
    }
  }

  static removeServer(context: Context, name: string): boolean {
    const persists = context.globalState;
    if (persists[name] !== undefined) {
      delete persists[name];
      // context.globalState.update(keyServerPersists, persists);
      context.globalState = persists;
      return true;
    } else {
      return false;
    }
  }

  static async loginServer(
    context: Context,
    api: BaseAPI,
    name: string,
    auth: { [key: string]: string },
  ): Promise<boolean> {
    const persists = context.globalState;
    const server = persists[name];
    if (server.login === undefined) {
      const res = auth.cookies
        ? await api.cookiesLogin(auth.cookies)
        : await api.passportLogin(auth.email, auth.password);
      if (
        res.type === "success" &&
        res.identity !== undefined &&
        res.userInfo !== undefined
      ) {
        server.login = {
          userId: res.userInfo.userId,
          username: auth.email || res.userInfo.userEmail,
          identity: res.identity,
        };
        // context.globalState.update(keyServerPersists, persists);
        context.globalState[keyServerPersists] = server;
        return true;
      } else {
        if (res.message !== undefined) {
          console.log(res.message);
        }
        return false;
      }
    } else {
      return false;
    }
  }

  static async logoutServer(
    context: Context,
    api: BaseAPI,
    name: string,
  ): Promise<boolean> {
    const persists = context.globalState;
    const server = persists[name];

    if (server.login !== undefined) {
      await api.logout(server.login.identity);
      delete server.login;
      // context.globalState.update(keyServerPersists, persists);
      context.globalState[keyServerPersists] = server;
      return true;
    } else {
      return false;
    }
  }

  static async fetchServerProjects(
    context: Context,
    api: BaseAPI,
    name: string,
  ): Promise<ProjectPersist[]> {
    const persists = context.globalState;
    const server = persists[name];

    if (server.login !== undefined) {
      let res = await api.getProjectsJson(server.login.identity);
      if (res.type !== "success") {
        // fallback to `userProjectsJson`
        res = await api.userProjectsJson(server.login.identity);
      }
      if (res.type === "success" && res.projects !== undefined) {
        Object.values(res.projects).forEach((project) => {
          project.userId = (server.login as any).userId;
        });
        const projects = res.projects.map((project) => {
          const existProject = server.login?.projects?.find(
            (p: any) => p.id === project.id,
          );
          // merge existing scm
          if (existProject) {
            project.scm = existProject.scm;
          }
          return project;
        });
        server.login.projects = projects;
        // context.globalState.update(keyServerPersists, persists);
        context.globalState[keyServerPersists] = server;
        return projects;
      } else {
        if (res.message !== undefined) {
          console.log(res.message);
        }
        return [];
      }
    } else {
      return [];
    }
  }

  static authenticate(context: Context, name: string) {
    const persists = context.globalState;
    const server = persists[name];
    return server.login !== undefined
      ? Promise.resolve(server.login.identity)
      : Promise.reject();
  }

  static initSocketIOAPI(context: Context, name: string, projectId: string) {
    const persists = context.globalState;
    const server = persists[name];

    if (server.login !== undefined) {
      const api = new ExtendedBaseAPI(server.url);
      const socket = new SocketIOAPI(
        server.url,
        api,
        server.login.identity,
        projectId,
      );
      return { api, socket };
    }
  }

  static getServerProjectSCMPersists(
    context: Context,
    serverName: string,
    projectId: string,
  ) {
    const persists = context.globalState;
    const server = persists[serverName];
    const project = server.login?.projects?.find(
      (project: any) => project.id === projectId,
    );
    const scmPersists = project?.scm
      ? (project.scm as ProjectSCMPersistMap)
      : {};
    return scmPersists;
  }

  static updateServerProjectSCMPersist(
    context: Context,
    serverName: string,
    projectId: string,
    scmKey: string,
    scmPersist?: ProjectSCMPersist,
  ) {
    // const persists = context.globalState.get<ServerPersistMap>(keyServerPersists, {});
    const persists = context.globalState[keyServerPersists];
    const server = persists;
    const project = server.login?.projects?.find(
      (project: any) => project.id === projectId,
    );
    if (project) {
      const scmPersists = (project.scm ?? {}) as ProjectSCMPersistMap;
      if (scmPersist === undefined) {
        delete scmPersists[scmKey];
      } else {
        scmPersists[scmKey] = scmPersist;
      }
      project.scm = scmPersists;
      context.globalState[keyServerPersists] = persists;
    }
  }
}

// Deno.test("CookieLogin", async () => {
//   const api = new BaseAPI("https://www.overleaf.com/");
//   const cookie = Deno.env.get("OVERLEAF_COOKIE") as string;
//   const context = new Context();
//   const auth = { cookies: cookie };
//   const StateManager = new GlobalStateManager();
//   const res = await StateManager.fetchServerProjects(context, api, "overleaf");
// });
