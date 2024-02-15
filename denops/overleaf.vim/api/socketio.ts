import {
  DocumentEntity,
  FileEntity,
  FileRefEntity,
  FileType,
  FolderEntity,
  ProjectEntity,
} from "../types.ts";
import { BaseAPI, Identity, ProjectMessageResponseSchema } from "./base.ts";
import { promisify } from "node:util";

export interface UpdateUserSchema {
  id: string;
  user_id: string;
  name: string;
  email: string;
  doc_id: string;
  row: number;
  column: number;
  last_updated_at?: number;
}

export interface OnlineUserSchema {
  client_age: number;
  client_id: string;
  connected: boolean;
  cursorData?: {
    column: number;
    doc_id: string;
    row: number;
  };
  email: string;
  first_name: string;
  last_name?: string;
  last_updated_at: string;
  user_id: string;
}

export interface UpdateSchema {
  doc: string; //doc id
  op?: {
    p: number; //position
    i?: string; //insert
    d?: string; // delete
    u?: boolean; // isUndo
  }[];
  v: number; //doc version number
  lastV?: string;
  meta?: {
    source: string;
    ts: number;
    user_id: string;
  };
}

export interface EventsHandler {
  onFileCreated?: (
    parentFolderId: string,
    type: FileType,
    entity: FileEntity,
  ) => void;
  onFileRenamed?: (entityId: string, newName: string) => void;
  onFileRemoved?: (entityId: string) => void;
  onFileMoved?: (entityId: string, newParentFolderId: string) => void;
  onFileChanged?: (update: UpdateSchema) => void;
  onDisconnected?: () => void;
  onConnectionAccepted?: (publicId: string) => void;
  onClientUpdated?: (user: UpdateUserSchema) => void;
  onClientDisconnected?: (id: string) => void;
  onReceiveMessage?: (message: ProjectMessageResponseSchema) => void;
  onSpellChecLanguageUpdated?: (language: string) => void;
  onCompilerUpdated?: (compiler: string) => void;
  onRootDocUpdated?: (rootDocId: string) => void;
}

type ConnectionScheme = "v1" | "v2";

export class SocketIOAPI {
  private scheme: ConnectionScheme = "v1";
  private record?: Promise<ProjectEntity>;
  private _handlers: Array<EventsHandler> = [];

  private socket?: any;
  private emit: any;
  constructor(
    private url: string,
    private readonly api: BaseAPI,
    private readonly identity: Identity,
    private readonly projectId: string,
  ) {
    this.init();
  }
  init() {
    switch (this.scheme) {
      case "v1":
        this.record = undefined;
        this.socket = this.api._initSocket(this.identity);
        break;
      case "v2":
        this.record = undefined;
        const query = `?project_id=${this.projectId}&t=${Date.now()}`;
        this.socket = this.api._initSocket(this.identity, query);
        break;
    }
    this.socket.emit = {};
    this.socket.emit[promisify.custom] = (event: string, ...args: any[]) => {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject("timeout");
        }, 5000);
      });
      const waitPromise = new Promise((resolve, reject) => {
        this.socket.emit(event, ...args, (err: any, ...data: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });
      return Promise.resolve([waitPromise, timeoutPromise]);
    };
    this.emit = promisify(this.socket.emit).bind(this.socket);
    this.initInternalHandlers();
  }

  private initInternalHandlers() {
    this.socket.on("connect", () => {
      console.log("SokcetIOAPI: connected");
    });
    this.socket.on("connect_failed", () => {
      console.log("SOkcetIOAPI: connect_failed");
    });
    this.socket.on("forceDisconnect", (message: string, delay = 10) => {
      console.log("SocketIOAPI: forceDisconnect", message);
    });
    this.socket.on("connectionRejected", (err: any) => {
      console.log("SocketIOAPI: connectionRejected", err.message);
    });
    if (this.scheme === "v2") {
      this.record = new Promise((resolve) => {
        this.socket.on("joinProjectResponse", (res: any) => {
          const publicId = res.publicId as string;
          const project = res.project as ProjectEntity;
          resolve(project);
        });
      });
    }
  }
  disconnect() {
    this.socket.disconnect();
  }

  get handlers() {
    return this._handlers;
  }
  resumeEventHandlers(handlers: Array<EventsHandler>) {
    this._handlers = [];
    handlers.forEach((handler) => {
      this.updateEventHandlers(handler);
    });
  }
  updateEventHandlers(handlers: EventsHandler) {
    this._handlers.push(handlers);
    Object.values(handlers).forEach((handler) => {
      switch (handler) {
        case handlers.onFileCreated:
          this.socket.on(
            "recieNewDoc",
            (parentFolderId: string, doc: DocumentEntity) => {
              handler(parentFolderId, "doc", doc);
            },
          );
          this.socket.on(
            "reciceNewFile",
            (parentFolderId: string, file: FileRefEntity) => {
              handler(parentFolderId, "file", file);
            },
          );
          this.socket.on(
            "recieveNewFolder",
            (parentFolderId: string, folder: FolderEntity) => {
              handler(parentFolderId, "folder", folder);
            },
          );
          break;
        case handlers.onFileRenamed:
          this.socket.on(
            "recieveEntityRename",
            (entityId: string, newName: string) => {
              handler(entityId, newName);
            },
          );
          break;
        case handlers.onFileMoved:
          this.socket.on(
            "reciveEntityMove",
            (entityId: string, folderId: string) => {
              handler(entityId, folderId);
            },
          );
          break;
        case handlers.onFileChanged:
          this.socket.on("otUpdateApplied", (update: UpdateSchema) => {
            handler(update);
          });
          break;
        case handlers.onDisconnected:
          this.socket.on("disconnect", () => {
            handler();
          });
          break;
        case handlers.onConnectionAccepted:
          this.socket.on("connectionAccepted", (_: any, publicId: any) => {
            handler(publicId);
          });
          this.socket.on(
            "socketioConnectedEvent",
            (arg: { publicId: string }) => {
              handler(arg.publicId);
            },
          );
          break;
        case handlers.onClientUpdated:
          this.socket.on(
            "clientTracking.clientUpdated",
            (user: UpdateUserSchema) => {
              handler(user);
            },
          );
          break;
        case handlers.onClientDisconnected:
          this.socket.on("clientTracking.clientDisconnected", (id: string) => {
            handler(id);
          });
          break;
        case handlers.onReceiveMessage:
          this.socket.on(
            "recieveMessage",
            (message: ProjectMessageResponseSchema) => {
              handler(message);
            },
          );
          break;
        case handlers.onSpellChecLanguageUpdated:
          this.socket.on("spellCheckLanguageUpdated", (language: string) => {
            handler(language);
          });
          break;
        case handlers.onCompilerUpdated:
          this.socket.on("compilerUpdated", (compiler: string) => {
            handler(compiler);
          });
          break;
        case handlers.onRootDocUpdated:
          this.socket.on("rootDocUpdated", (rootDocId: string) => {
            handler(rootDocId);
          });
          break;
        default:
          break;
      }
    });
  }
  async joinProject(project_id: string): Promise<ProjectEntity> {
    const timeoutPromise: Promise<any> = new Promise((_, reject) => {
      setTimeout(() => {
        reject("timeout");
      }, 5000);
    });
    switch (this.scheme) {
      case "v1":
        const joinPromise = this.emit("joinProject", { project_id }).then(
          (returns: [ProjectEntity, string, number]) => {
            const [project, permissionsLevel, protocolVersion] = returns;
            this.record = Promise.resolve(project);
            return project;
          },
        );
        const rejectPromise = new Promise((_, reject) => {
          this.socket.on("connectionRejected", (err: any) => {
            this.scheme = "v2";
            reject(err.message);
          });
        });
        return Promise.race([joinPromise, rejectPromise, timeoutPromise]);
      case "v2":
        return Promise.race([this.record!, timeoutPromise]);
    }
  }
}
