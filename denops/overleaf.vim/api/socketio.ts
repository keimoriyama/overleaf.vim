import { BaseAPI, Identity, ProjectMessageResponseSchema } from "./base.ts";
import {
  DocumentEntity,
  FileEntity,
  FileRefEntity,
  FileType,
  FolderEntity,
  ProjectEntity,
} from "../core/remoteFileSystemProvider.ts";
import { EventBus } from "../utils/eventBus.ts";
import { SocketIOAlt } from "./socketioAlt.ts";

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
  last_name: string;
  last_updated_at: string;
  user_id: string;
}

export interface UpdateSchema {
  doc: string;
  op?: {
    p: number;
    i?: string;
    d?: string;
    u?: string;
  }[];
  v: number;
  lastV?: number;
  hash?: string;
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
    eneity: FileEntity,
  ) => void;
  onFileRenamed?: (entityId: string, newName: string) => void;
  onFileRemoved?: (entityId: string) => void;
  onFileMoved?: (entityId: string, newParentFolderId: string) => void;
  onFileChanged?: (update: UpdateSchema) => void;

  onDisconnected?: () => void;
  onConnectionAccepted?: (publicId: string) => void;
  onClientUpdated?: (user: UpdateUserSchema) => void;
  onClientDisconnected?: (id: string) => void;

  onReceivedMessage?: (message: ProjectMessageResponseSchema) => void;

  onSpellCheckLanguageUPdated?: (language: string) => void;
  onCompilerUpdated?: (compiler: string) => void;
  onRootDocUpdated?: (rootDocId: string) => void;
}

type ConnectionScheme = "Alt" | "v1" | "v2";

export class SocketIOAPI {
  private scheme: ConnectionScheme = "v1";
  private record?: Promise<ProjectEntity>;
  private _handlers: Array<EventsHander> = [];

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
    // connect
    switch (this.scheme) {
      case "Alt":
        this.socket = new SocketIOAlt(
          this.url,
          this.api,
          this.identity,
          this.projectId,
          this.record!,
        );
        break;
      case "v1":
        this.record = undefined;
        this.socket = this.api._initSocketV0(this.identity);
        break;
      case "v2":
        this.record = undefined;
        const query = `?projectId=${this.projectId}&t=${Date.now()}`;
        this.socket = this.api._initSocketV0(this.identity, query);
        break;
    }
    // create emit
    this.socket.emit[require("util").promisify.custom] = (
      event: string,
      ...args: any[]
    ) => {
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
    };
    this.emit = require("util").promisify(this.socket.emit).bind(this.socket);
    this.initInternalHanders();
  }

  private initInternalHanders() {
    this.socket.on("connect", () => {
      console.log("SocketIOAPI: connected");
    });
    this.socket.on("connect_failed", () => {
      console.log("SocketIOAPI: connect_failed");
    });
    this.socket.on("forceDisconnect", (message: string, delay = 10) => {
      console.log("SocketIOAPI: forceDisconnect", message);
    });
    this.socket.on("error", (err: any) => {
      throw new Error(err);
    });
    if (this.scheme === "v2") {
      this.record = new Promise((resolve) => {
        this.socket.on("joinProjectResponse", (res: any) => {
          const publicId = res.publicId as string;
          const project = res.project as ProjectEntity;
          EventBus.fire("socketioConnectedEvent", { publicId });
          resolve(project);
        });
      });
    }
  }
  disconnect() {
    this.socket.disconnect();
  }
}
