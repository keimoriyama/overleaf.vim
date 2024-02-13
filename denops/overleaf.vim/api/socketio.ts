import {
  DocumentEneity,
  FileEntity,
  FileRefEntity,
  FileType,
  FolderEntity,
  ProjectEntity,
} from "../types.ts";
import { BaseAPI, Identity, ProjectMessageResponseSchema } from "./base.ts";

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
  private _handlers: Array<EventHandler> = [];

  private socket?: any;
  private emit: any;
  constructor(
    private url: string,
    private readonly api: BaseAPI,
    private readonly identity: Identity,
    private readonly proejctId: string,
  ) {
    this.init();
  }
  init() {
    return;
  }
}
