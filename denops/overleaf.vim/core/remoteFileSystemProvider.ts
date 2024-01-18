export type FileType = "doc" | "file" | "folder" | "outputs";
export type FolderKey = "docs" | "fileRefs" | "folders" | "outputs";

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

export class VirtualFileSystem {
  private root?: ProjectEntity;
  private initializing?: Promise<ProjectEntity>;
  private retryConnection = 0;

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
    return Promise.resolve(this.root);
  }
}

export class RemoteFileSystemProvider {
  private vfss: { [key: string]: VirtualFileSystem };
}

