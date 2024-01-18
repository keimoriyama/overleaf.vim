import { Agent as httpsAgent } from "https://deno.land/std@0.145.0/node/https.ts";
import { Agent as httpAgent } from "https://deno.land/std@0.145.0/node/http.ts";

export interface Identity {
  csrfToken: string;
  cookies: string;
}

export interface MemberEntity {
  _id: string;
  first_name: string;
  last_name?: string;
  email: string;
  privileges?: string;
  signUpDate?: string;
}

export interface ProjectSettingsSchema {
  learnedWords: string[];
  languages: { code: string; name: string }[];
  compilers: { code: string; name: string }[];
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
