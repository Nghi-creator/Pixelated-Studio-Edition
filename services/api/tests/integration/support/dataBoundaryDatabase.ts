import { FakeQueryBuilder } from "./dataBoundaryQueries.js";
import { FakeRpcExecutor } from "./dataBoundaryRpcs.js";
import type { User } from "@supabase/supabase-js";

export type TableName =
  | "access_logs"
  | "comment_likes"
  | "comments"
  | "favorites"
  | "catalog_ingestion_candidates"
  | "game_builds"
  | "game_rights"
  | "game_submissions"
  | "games"
  | "likes"
  | "local_engine_pairings"
  | "reported_comments"
  | "stream_metrics"
  | "profiles"
  | "user_game_activity";

export type RecordRow = Record<string, unknown>;

export class FakeSupabase {
  authDeleteError: Error | null = null;
  authListUsersCalls = 0;
  authUsers: User[] = [];
  browserSmokeArtifactClaims = new Set<string>();
  deletedUsers: string[] = [];
  deletionRequests = new Set<string>();
  storageOwners = new Map<string, string>();
  storageErrors = new Set<string>();
  storageRemoveErrors = new Set<string>();
  signedStorageUrls: { bucket: string; expiresIn: number; path: string }[] = [];
  storageObjects: Record<string, string[]> = {
    avatars: [],
    submissions: [],
  };
  removedStorageObjects: { bucket: string; paths: string[] }[] = [];
  uploadedStorageObjects: {
    bucket: string;
    bytes: number;
    path: string;
  }[] = [];
  rows: Record<TableName, RecordRow[]> = {
    access_logs: [],
    catalog_ingestion_candidates: [],
    comment_likes: [],
    comments: [],
    favorites: [],
    game_builds: [],
    game_rights: [],
    game_submissions: [],
    games: [],
    likes: [],
    local_engine_pairings: [],
    reported_comments: [],
    stream_metrics: [],
    profiles: [],
    user_game_activity: [],
  };
  rpcCalls: { fn: string; params: RecordRow }[] = [];
  rpcErrors = new Map<string, Error>();
  auth = {
    admin: {
      deleteUser: async (userId: string) => {
        if (this.authDeleteError) {
          return { error: this.authDeleteError };
        }
        if (Object.entries(this.storageObjects).some(([bucket, paths]) => paths.some(path => path.startsWith(`${userId}/`) || this.storageOwners.get(`${bucket}/${path}`) === userId))) {
          return { error: new Error("User owns Storage objects") };
        }
        this.deletionRequests.delete(userId);
        this.deletedUsers.push(userId);
        return { error: null };
      },
      listUsers: async ({
        page = 1,
        perPage = 1000,
      }: {
        page?: number;
        perPage?: number;
      } = {}) => {
        this.authListUsersCalls += 1;
        const start = (page - 1) * perPage;
        return {
          data: { users: this.authUsers.slice(start, start + perPage) },
          error: null,
        };
      },
    },
    getUser: async (token: string) => ({
      data: {
        user: this.authUsers.find((user) => user.id === token) || null,
      },
      error: null,
    }),
  };
  storage = {
    from: (bucket: string) => ({
      list: async (prefix: string) => {
        if (this.storageErrors.has(bucket)) {
          return { data: null, error: new Error(`${bucket} storage unavailable`) };
        }

        const childEntries = new Map<string, { id: string | null; name: string }>();
        for (const path of this.storageObjects[bucket] || []) {
          if (!path.startsWith(`${prefix}/`)) continue;

          const remainingPath = path.slice(prefix.length + 1);
          const [name, ...rest] = remainingPath.split("/");
          childEntries.set(name, {
            id: rest.length === 0 ? path : null,
            name,
          });
        }

        return { data: [...childEntries.values()], error: null };
      },
      remove: async (paths: string[]) => {
        if (
          this.storageErrors.has(bucket) ||
          this.storageRemoveErrors.has(bucket)
        ) {
          return { data: null, error: new Error(`${bucket} storage unavailable`) };
        }

        const pathSet = new Set(paths);
        this.storageObjects[bucket] = (this.storageObjects[bucket] || []).filter(
          (path) => !pathSet.has(path),
        );
        this.removedStorageObjects.push({ bucket, paths });
        return { data: paths, error: null };
      },
      upload: async (path: string, body: Blob | Buffer | Uint8Array) => {
        if (this.storageErrors.has(bucket)) {
          return { data: null, error: new Error(`${bucket} storage unavailable`) };
        }

        const bytes =
          body instanceof Blob
            ? body.size
            : Buffer.isBuffer(body)
              ? body.length
              : body.byteLength;
        this.storageObjects[bucket] = [
          ...(this.storageObjects[bucket] || []).filter(
            (existingPath) => existingPath !== path,
          ),
          path,
        ];
        this.uploadedStorageObjects.push({ bucket, bytes, path });
        return { data: { path }, error: null };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://storage.example.test/${bucket}/${path}` },
      }),
      createSignedUrl: async (path: string, expiresIn: number) => {
        if (this.storageErrors.has(bucket)) {
          return { data: null, error: new Error(`${bucket} storage unavailable`) };
        }

        this.signedStorageUrls.push({ bucket, expiresIn, path });
        return {
          data: {
            signedUrl: `https://storage.example.test/object/sign/${bucket}/${path}?token=signed-${expiresIn}`,
          },
          error: null,
        };
      },
    }),
  };

  from(table: TableName) {
    return new FakeQueryBuilder(this, table);
  }

  rpc(fn: string, params: RecordRow) {
    return new FakeRpcExecutor(this).rpc(fn, params);
  }
}
