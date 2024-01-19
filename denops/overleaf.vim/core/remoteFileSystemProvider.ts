// remoteのファイルをローカルで処理するためのファイルシステムの構築をしている
import {
  ExtendedBaseAPI,
  ProjectLinkedFileProvider,
  UrlLinkedFileProvider,
} from "../api/extendedBase.ts";
import { GlobalStateManager } from '../utils/globalStateManager.ts';
import { MemberEntity, ProjectSettingsSchema } from "../api/base.ts";

export type FileType = "doc" | "file" | "folder" | "outputs";
export type FolderKey = "docs" | "fileRefs" | "folders" | "outputs";
const FolderKeys: {[_type:string]: FolderKey} = {
	'folder': "folders",
	"doc": "docs",
	"file": "fileRefs",
	"outputs": "outputs"
}

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

export class File{
	name:string;
	ctime:number;
	mtime:number;
	size: number;
	constructor(name:string, ctime?:number){
		this.name = name;
		this.ctime = ctime|| Date.now()
		this.mtime = Date.now()
		this.size = 0
	}
}
export function parseUri(uri: any) {
    const query:any = uri.query.split('&').reduce((acc, v) => {
        const [key,value] = v.split('=');
        return {...acc, [key]:value};
    }, {});
    const [userId, projectId] = [query.user, query.project];
    const _pathParts = uri.path.split('/');
    const serverName = uri.authority;
    const projectName = _pathParts[1];
    const pathParts = _pathParts.splice(2);
    const identifier = `${userId}/${projectId}/${projectName}`;
    return {userId, projectId, serverName, projectName, identifier, pathParts};
}

export class VirtualFileSystem {
  private root?: ProjectEntity;
  private currentVersion?:number;
  private api: BaseAPI;
  private socket: SocketIOAPI;
  private publicId?:string;
  private userId: string
  private isDirty: boolean;
  private initializing?: Promise<ProjectEntity>;
  private retryConnection = 0;
public readonly projectName: string;
    public readonly serverName: string;
    public readonly projectId: string;

	constructor(uri:any){
		const {userId, projectId, serverName,projectName, identifier,pathParts} = parseUri(uri)
		this.serverName = serverName;
		this.projectName = projectName;
		this.userId= userId;
		this.projectId = projectId;
		const res = GlobalStateManager.initSocketIOAPI(this.serverName,projectId);
		if (res){
			this.api = res.api;
			this.socket = res.socket
		}else{
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
	return this.socket.joinProject(this.projectId).then(async (project)=>{
		const identity = await GlobalStateManager.authenticate(this.context, this.serverName);
		project.settings = (await this.api.getProjectSettings(identity, this.projectId)).settings!;
		this.root = project
	})
  }
}

export class RemoteFileSystemProvider {
  private vfss: { [key: string]: VirtualFileSystem };
}
