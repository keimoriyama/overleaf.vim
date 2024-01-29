// remoteのファイルをローカルで処理するためのファイルシステムの構築をしている
import {
  ExtendedBaseAPI,
  ProjectLinkedFileProvider,
  UrlLinkedFileProvider,
} from "../api/extendedBase.ts";
import { GlobalStateManager } from "../utils/globalStateManager.ts";
import { MemberEntity, ProjectSettingsSchema } from "../api/base.ts";

export type FileType = "doc" | "file" | "folder" | "outputs";
export type FolderKey = "docs" | "fileRefs" | "folders" | "outputs";
const FolderKeys: { [_type: string]: FolderKey } = {
  folder: "folders",
  doc: "docs",
  file: "fileRefs",
  outputs: "outputs",
};

export interface FileEntity {
  _id: string;
  name: string;
  _type?: FileType;
  readonly?: boolean;
}

export interface DocumentEntity extends FileEntity {
  version?: number;
  mtime?: number;
  lastVersion?: number;
  localCache?: string;
  remoteCache?: string;
}

export interface FileRefEntity extends FileEntity {
  linkedFileData: ProjectLinkedFileProvider | UrlLinkedFileProvider | null;
  created: string;
}

export interface OutputFileEntity extends FileEntity {
  path: string;
  url: string;
  type: string;
  build: string;
}

export interface FolderEntity extends FileEntity {
  docs: Array<DocumentEntity>;
  fileRefs: Array<FileRefEntity>;
  folders: Array<FolderEntity>;
  outputs?: Array<OutputFileEntity>;
}

export interface ProjectEntity {
  _id: string;
  name: string;
  rootDoc_id: string;
  rootFolder: Array<FolderEntity>;
  publicAccessLevel: string; //"tokenBased"
  compiler: string;
  spellCheckLanguage: string;
  deletedDocs: Array<{
    _id: string;
    name: string;
    deletedAt: string;
  }>;
  members: Array<MemberEntity>;
  invites: Array<MemberEntity>;
  owner: MemberEntity;
  features: { [key: string]: any };
  settings: ProjectSettingsSchema;
}
//
// export class File{
// 	name:string;
// 	ctime:number;
// 	mtime:number;
// 	size: number;
// 	constructor(name:string, ctime?:number){
// 		this.name = name;
// 		this.ctime = ctime|| Date.now()
// 		this.mtime = Date.now()
// 		this.size = 0
// 	}
// }
export function parseUri(uri: any) {
  const query: any = uri.query.split("&").reduce((acc, v) => {
    const [key, value] = v.split("=");
    return { ...acc, [key]: value };
  }, {});
  const [userId, projectId] = [query.user, query.project];
  const _pathParts = uri.path.split("/");
  const serverName = uri.authority;
  const projectName = _pathParts[1];
  const pathParts = _pathParts.splice(2);
  const identifier = `${userId}/${projectId}/${projectName}`;
  return { userId, projectId, serverName, projectName, identifier, pathParts };
}

export class VirtualFileSystem {
  private root?: ProjectEntity;
  private currentVersion?: number;
  private context: Context;
  private api: BaseAPI;
  private socket: SocketIOAPI;
  private publicId?: string;
  private userId: string;
  private isDirty: boolean;
  private initializing?: Promise<ProjectEntity>;
  private retryConnection = 0;
  public readonly projectName: string;
  public readonly serverName: string;
  public readonly projectId: string;

  constructor(uri: any) {
    const {
      userId,
      projectId,
      serverName,
      projectName,
      identifier,
      pathParts,
    } = parseUri(uri);
    this.serverName = serverName;
    this.projectName = projectName;
    this.userId = userId;
    this.projectId = projectId;
    const res = GlobalStateManager.initSocketIOAPI(this.serverName, projectId);
    if (res) {
      this.api = res.api;
      this.socket = res.socket;
    } else {
      // Error
    }
  }
  async init(): Promise<ProjectEntity> {
    if (this.root) {
      return Promise.resolve(this.root);
    }
    if (!this.initializing) {
      this.initializing = this.initializingPromise;
    }
    return this.initializing;
  }
  private get initializingPromise(): Promise<ProjectEntity> {
    if (this.retryConnection >= 3) {
      this.retryConnection = 0;
      // TODO: Show Error message about Connection lost
    }
    if (this.retryConnection > 0) {
      this.socket.init();
    }
    this.remoteWatch();
    this.root = undefined;
    return this.socket.joinProject(this.projectId).then(async (project) => {
      const identity = await GlobalStateManager.authenticate(
        this.context,
        this.serverName,
      );
      project.settings = (
        await this.api.getProjectSettings(identity, this.projectId)
      ).settings!;
      this.root = project;
    });
  }
  private remoteWatch(): void {
    this.sotcket.updateEventHandlers({
      onDisconnected: () => {
        if (this.root === undefined) {
          return;
        }
        console.log("Disconnected");
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
        const res = this._resolveById(parentFolderId);
        if (res) {
          const { fileEntity, path } = res;
          const eneityPath = path + entity.name;
          this.insertEntity(fileEntity as FolderEntity, type, entity);
        }
      },
      onFileRenamed: (entityId: string, newName: string) => {
        const res = this._resolveById(entityId);
        if (res) {
          const { fileEntity } = res;
          const oldName = fileEntity.name;
          fileEntity.name = newName;
        }
      },
      onFileRemoved: (entityId: string) => {
        const res = this._resolveById(entityId);
        if (res) {
          const { parentFolder, fileType, fileEntity } = res;
          this.removeEntity(parentFolder, fileType, fileEntity);
        }
      },
      onFileMoved: (entityId: string, folderId: string) => {
        const oldPath = this._resolveById(entityId);
        const newPath = this._resolveById(folderId);
        if (oldPath && newPath) {
          const newParentFolder = newPath.fileEntity as FolderEntity;
          this.insertEntity(
            newParentFolder,
            oldPath.fileType,
            oldPath.fileEntity,
          );
          this.removeEntity(
            oldPath.parentFolder,
            oldPath.fileType,
            oldPath.fileEntity,
          );
        }
      },
      onFileCahnged: (update: UpdateSchema) => {
        const res = this._resolveById(update.doc);
        if (res === undefined) {
          return;
        }
        const doc = res.fileEntity as DocumentEntity;
        if (update.v === doc.version) {
          doc.version += 1;
          if (update.op && doc.remoteCache !== undefined) {
            let content = doc.remoteCache;
            update.op.forEach((op) => {
              if (op.i) {
                content = content.slice(0, op.p) + op.i + content.slice(op.p);
              } else if (op.d) {
                const deleteUtf8 = Buffer.from(op.d, "ascii").toString("utf8");
                content =
                  content.slice(0, op.p) +
                  content.slice(op.p + deleteUtf8.length);
              }
            });
            // Fileの変更を反映させる
          }
        } else {
          doc.remoteCache = undefined;
          doc.localCache = undefined;
        }
      },
      onSpellCheckLanguageUpdated: (language: string) => {
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
  async _resolveUri(uri: string) {
    const [parentFolder, fileName] = await (async () => {
      const { pathParts } = parseUri(uri);
      const root = await this.init();

      let currentFolder = root.rootFolder[0];
      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderName = pathParts[i];
        const folder = currentFolder.folders.find(
          (folder) => folder.name === folderName,
        );
        if (folder) {
          currentFolder = folder;
        } else {
          console.log("File not Found");
        }
      }
      const fileName = pathParts[pathParts.length - 1];
      return [currentFolder, fileName];
    })();
    const [fileEntity, fileType, fileId] = (() => {
      for (const _type of Object.keys(FolderKeys)) {
        let entity = parentFolder[FolderKeys[_type]]?.find(
          (entity) => entity.name === fileName,
        );
        if (!fileName && _type === "folder") {
          entity = parentFolder;
        }
        if (entity) {
          return [entity, _type as FileType, entity._id];
        }
      }
      return [];
    })();
    return { parentFolder, fileName, fileEntity, fileType, fileId };
  }
  private _resolveById(
    entityId: string,
    root?: FolderEntity,
    path?: string,
  ):
    | {
        parentFolder: FolderEntity;
        fileEntity: FileEntity;
        fileType: FileType;
        path: string;
      }
    | undefined {
    if (!this.root) {
      console.log("File not Found");
    }
    root = root || this.root.rootFolder[0];
    path = path || "/";
    if (root._id === entityId) {
      return { parentFolder: root, fileType: "folder", fileEntity: root, path };
    } else {
      // search files in root
      for (const _type of Object.keys(FolderKeys)) {
        const key = FolderKeys[_type];
        if (key === "folders") {
          continue;
        }
        const entity = root[key]?.find((entity) => entity._id === entityId);
        if (entity) {
          return {
            parentFolder: root,
            fileType: _type as FileType,
            fileEntity: entity,
            path: path + entity.name,
          };
        }
        for (const folder of root.folders) {
          const res = this._resolveById(
            entityId,
            folder,
            path + folder.name + "/",
          );
          if (res) {
            return res;
          }
        }
      }
      return undefined;
    }
  }
  async openFile(uri): Promise<Uint8Array> {
    const { fileType, fileEntity } = await this._resolveUri(uri);
    if (!fileEntity) {
      console.log("File not Found");
    }
    if (fileType === "doc") {
      const doc = fileEntity as DocumentEntity;
      if (doc.remoteCache !== undefined) {
        const content = doc.remoteCache;
        return new TextEncoder().encode(content);
      } else {
        const res = await this.socket.joinDoc(fileEntity._id);
        const content = res.docLines.join("\n");
        doc.version = res.version;
        doc.remoteCache = content;
        doc.localCache = content;
        return new TextEncoder().encode(content);
      }
    } else if (fileType === "outputs") {
      return GlobalStateManager.authenticate(
        this.context,
        this.serverName,
      ).then((identity) => {
        return this.api
          .getFileFromClsi(
            identity,
            (fileEntity as OutputFileEntity).url,
            "standard",
          )
          .then((res) => {
            if (res.type === "success") {
              return res.content;
            } else {
              return new Uint8Array(0);
            }
          });
      });
    }
  }
  private insertEntity(
    parentFolder: FolderEntity,
    fileType: FileType,
    entity: FileEntity,
  ) {
    const key = FolderKeys[fileType];
    parentFolder[key]?.push(entity as any);
  }
  private removeEntity(
    parentFolder: FolderEntity,
    fileType: FileType,
    entity: FileEntity,
  ) {
    const key = FolderKeys[fileType];
    const index = parentFolder[key]?.findIndex((e) => e._id === entity._id);
    if (index !== undefined && index >= 0) {
      parentFolder[key]?.splice(index, 1);
      return true;
    } else {
      return false;
    }
  }
}

// ファイルシステム
// export class RemoteFileSystemProvider {
//   private vfss: { [key: string]: VirtualFileSystem };
// }
