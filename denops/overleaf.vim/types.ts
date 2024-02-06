import {
  ProjectLinkedFileProvider,
  UrlLinkedFileProvider,
} from "./api/extendedBase.ts";
import { MemberEntity, ProjectSettingsSchema } from "./api/base.ts";
export type FileType = "doc" | "file" | "folder" | "outputs";

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
  created: string; //ISO date string
}
export interface FolderEntity extends FileEntity {
  docs: Array<DocumentEntity>;
  fileRefs: Array<FileRefEntity>;
  folders: Array<FolderEntity>;
  outputs?: Array<OutputFileEntity>;
}

export interface OutputFileEntity extends FileEntity {
  path: string; //output file name
  url: string; // `project/${projectId}/user/${userId}/output/${build}/output/${path}`
  type: string; //output file type (postfix)
  build: string; //build id
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
