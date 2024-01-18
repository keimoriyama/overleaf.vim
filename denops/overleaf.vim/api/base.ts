import { Agent as httpsAgent } from "https://deno.land/std@0.145.0/node/https.ts";
import { Agent as httpAgent } from "https://deno.land/std@0.145.0/node/http.ts";

export interface Identity {
  csrfToken: string;
  cookies: string;
}

export interface NewProjectResponseSchema {
  project_id: string;
  owner_ref: string;
  owner: MemberEntity;
}

export interface CompileResponseSchema {
  status: "success" | "error";
  compileGroup: string;
  outputFiles: Array<OutputFileEntity>;
  stats: {
    "latex-errors": number;
    "pdf-size": number;
    "latex-runs": number;
    "latex-runs-with-errors": number;
    "latex-runs-0": number;
    "latex-runs-with-error-0s": number;
  };
  timings: {
    "sync": number;
    "compile": number;
    "output": number;
    "compile2E": number;
  };
  enableHybridPdfDownload: boolean;
}

export interface SyncPdfResponseSchema {
  file: string;
  line: number;
  column: number;
}

export interface SyncCodeResponseSchema {
  pdf: Array<{
    page: number;
    h: number;
    v: number;
    width: number;
    height: number;
  }>;
}

export interface SnippetItemSchema {
  meta: string;
  score: number;
  caption: string;
  snippet: string;
}

export interface MissspellingItemSchema {
  index: number;
  suggestions: string[];
}

export interface MemberEntity {
  _id: string;
  first_name: string;
  last_name?: string;
  email: string;
  privileges?: string;
  signUpDate?: string;
}

export interface MetadataResponseScheme {
  projectId: string;
  projectMeta: {
    [id: string]: {
      labels: string[];
      packages: { [K: string]: SnippetItemSchema[] };
    };
  };
}

export interface ProjectPersist {
  id: string;
  userId: string;
  name: string;
  lastUpdated?: string;
  lastUpdatedBy?: MemberEntity;
  source?: "owner" | "collaborator" | "readOnly";
  accessLevel: "owner" | "collaborator" | "readOnly";
  archived?: boolean;
  trashed?: boolean;
  scm?: any;
}

export interface ProjectTagsResponseSchema {
  __v: number;
  _id: string;
  name: string;
  user_id: string;
  project_ids: string[];
}

export interface ProjectLabelResponseSchena {
  id: string;
  comment: string;
  version: string;
  user_id: string;
  created_at: number;
  user_display_name?: string;
}

export interface ProjectUpdateMeta {
  users: {
    id: string;
    first_name: string;
    last_name?: string;
    email: string;
  }[];
  start_ts: number;
  end_ts: number;
}

export interface ProjectHistoryResponseSchema {
  fromV: number;
  toV: number;
  meta: ProjectUpdateMeta;
  labels: ProjectLabelResponseSchena[];
  pathnames: string[];
  project_ops: {
    add?: { pathname: string };
    remove?: { pathname: string };
    atV: number;
  }[];
}

export interface ProjectUpdateResponseSchema {
  updates: ProjectHistoryResponseSchema[];
  nextBeforeTimestamp: number;
}

export interface ProjectFileDiffResponseSchema {
  diff: {
    u?: string;
    d?: string;
    i?: string;
    meta?: string;
  }[];
}

export interface ProjectMessageResponseSchema {
  id: string;
  content: string;
  timestamp: number;
  user_id: string;
  user: {
    id: string;
    first_name: string;
    last_name?: string;
    email: string;
  };
  cliendId: string;
}

export interface ProjectSettingsSchema {
  learnedWords: string[];
  languages: { code: string; name: string }[];
  compilers: { code: string; name: string }[];
}

export interface ResponseSchema {
  type: "success" | "error";
  raw?: ArrayBuffer;
  message?: string;
  userInfo?: { userId: string; userEmail: string };
  identity?: Identity;
  projects?: ProjectPersist[];
  entity?: FileEntity;
  entities?: { path: string; type: string }[];
  compile?: CompileResponseSchema;
  content?: Uint8Array;
  syncPdf?: SyncPdfResponseSchema;
  syncCode?: SyncCodeResponseSchema;
  meta?: MetadataResponseScheme;
  missspellings?: MissspellingItemSchema[];
  tags?: ProjectTagsResponseSchema[];
  labels?: ProjectLabelResponseSchena[];
  updates?: ProjectUpdateResponseSchema;
  diff?: ProjectFileDiffResponseSchema;
  treeDiff?: ProjectFileDiffResponseSchema;
  messages?: ProjectMessageResponseSchema;
  settings?: ProjectSettingsSchema;
}

export class BaseAPI {
  private url: string;
  private agent: httpAgent | httpsAgent;
  private identity?: Identity;
  constructor(url: string) {
    this.url = url;
    this.agent = new URL(url).protocol === "http:"
      ? new httpAgent({ keepAlive: true })
      : new httpsAgent({ keepAlive: true });
  }
  private async fetchUserId(cookies: string) {
    const res: Response = await fetch(this.url + "project", {
      method: "GET",
      redirect: "manual",
      headers: {
        "Connection": "keep-alive",
        "Cookie": cookies,
      },
    });
    const body = await res.text();
    const userIDMatch = body.match(
      /<meta\s+name="ol-user_id"\s+content="([^"]*)">/,
    );
    const userEmailMatch = body.match(
      /<meta\s+name="ol-usersEmail"\s+content="([^"]*)">/,
    );
    const csrfTokenMatch = body.match(
      /<meta\s+name="ol-csrfToken"\s+content="([^"]*)">/,
    );
    if (userIDMatch !== null && csrfTokenMatch !== null) {
      const userId = userIDMatch[1];
      const csrfToken = csrfTokenMatch[1];
      const userEmail = userEmailMatch ? userEmailMatch[1] : "";
      return { userId, userEmail, csrfToken };
    } else {
      return undefined;
    }
  }
  async cookiesLogin(cookies: string) {
    const res = await this.fetchUserId(cookies);
    if (res) {
      const { userId, userEmail, csrfToken } = res;
      const identity = await this.updateCookies({ cookies, csrfToken });
      return {
        type: "succcess",
        userInfo: { userId, userEmail },
        Identity: identity,
      };
    } else {
      return {
        type: "error",
        message: "Login failed",
      };
    }
  }
  async updateCookies(identity: Identity) {
    const res = await fetch(this.url + "socket.io/socket.io.js", {
      method: "GET",
      redirect: "manual",
      headers: {
        "Connection": "keep-alive",
        "Cookie": identity.cookies,
      },
    });
    const header = res.headers.getSetCookie();
    if (header !== undefined) {
      const cookies = header[0].split(";")[0];
      console.log(cookies);
      if (cookies) {
        identity.cookies = `${identity.cookies}; ${cookies}`;
      }
    }
    return identity;
  }
}

Deno.test("test_fetchUserId", async () => {
  const api = new BaseAPI("https://www.overleaf.com/");
  const cookie = Deno.env.get("OVERLEAF_COOKIE") as string;
  const res = await api.cookiesLogin(cookie);
  console.log(res);
});
