import type { FakeSupabase, RecordRow } from "./dataBoundaryDatabase.js";

/** RPC behavior is isolated from storage/auth and chainable table queries. */
export class FakeRpcExecutor {
  constructor(private readonly db: FakeSupabase) {}

  async rpc(fn: string, params: RecordRow) {
    this.db.rpcCalls.push({ fn, params });
    const rpcError = this.db.rpcErrors.get(fn);
    if (rpcError) return { data: null, error: rpcError };

    if (fn === "begin_account_deletion") {
      this.db.deletionRequests.add(String(params.p_user_id));
      return { data: null, error: null };
    }
    if (fn === "list_account_deletion_objects") {
      const objects = Object.entries(this.db.storageObjects).flatMap(([bucket, paths]) =>
        paths.filter(path => this.db.storageOwners.get(`${bucket}/${path}`) === params.p_user_id)
          .map(name => ({ bucket_id: bucket, name })),
      ).sort((a, b) => `${a.bucket_id}/${a.name}`.localeCompare(`${b.bucket_id}/${b.name}`));
      const offset = Number(params.p_offset);
      return { data: objects.slice(offset, offset + Number(params.p_limit)), error: null };
    }
    if (fn === "reject_game_submission") {
      const submission = this.db.rows.game_submissions.find(
        (row) => row.id === params.p_submission_id,
      );
      if (!submission) {
        return { data: null, error: new Error("submission_not_found") };
      }
      if (submission.status !== "pending") {
        return { data: null, error: new Error("submission_already_reviewed") };
      }

      Object.assign(submission, {
        review_notes: String(params.p_review_notes).trim(),
        reviewed_at: new Date().toISOString(),
        reviewed_by: params.p_reviewer_id,
        status: "rejected",
        updated_at: new Date().toISOString(),
      });
      return { data: { ...submission }, error: null };
    }

    if (fn === "set_game_reaction") {
      this.setReaction("likes", "game_id", params.p_game_id, params);
      return { data: null, error: null };
    }

    if (fn === "set_comment_reaction") {
      this.setReaction("comment_likes", "comment_id", params.p_comment_id, params);
      return { data: null, error: null };
    }

    if (fn === "create_submission_candidate") {
      const submission = this.db.rows.game_submissions.find(
        (row) => row.id === params.p_submission_id,
      );
      const candidatePayload = params.p_candidate as RecordRow;
      const candidate = {
        id: `catalog_ingestion_candidates-${
          this.db.rows.catalog_ingestion_candidates.length + 1
        }`,
        ...candidatePayload,
      };
      this.db.rows.catalog_ingestion_candidates.push(candidate);
      if (submission) {
        Object.assign(submission, {
          catalog_candidate_id: candidate.id,
          review_notes: params.p_review_notes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: params.p_reviewer_id,
          status: "candidate_created",
          updated_at: new Date().toISOString(),
        });
      }
      return {
        data: { candidate, submission: submission || null },
        error: null,
      };
    }

    if (fn === "resolve_comment_report") {
      if (params.p_action === "ban_user") {
        const profile = this.db.rows.profiles.find(
          (row) => row.id === params.p_target_user_id,
        );
        if (profile) profile.is_banned = true;
      }
      this.db.rows.comments = this.db.rows.comments.filter(
        (row) => row.id !== params.p_comment_id,
      );
      this.db.rows.reported_comments = this.db.rows.reported_comments.filter(
        (row) => row.comment_id !== params.p_comment_id,
      );
      return { data: null, error: null };
    }

    if (fn === "record_access_log") {
      const sessionId = String(params.p_session_id);
      const userId = typeof params.p_user_id === "string" ? params.p_user_id : null;
      const existing = this.db.rows.access_logs.find(
        (row) => row.session_id === sessionId,
      );
      const now = new Date().toISOString();
      if (!existing) {
        this.db.rows.access_logs.push({
          access_count: 1,
          created_at: now,
          last_seen_at: now,
          path: params.p_path,
          session_id: sessionId,
          user_id: userId,
        });
      } else if (!existing.user_id || existing.user_id === userId) {
        existing.access_count = Number(existing.access_count || 0) + 1;
        existing.last_seen_at = now;
        existing.path = params.p_path;
        existing.user_id = existing.user_id || userId;
      }
      return { data: null, error: null };
    }

    if (fn === "record_browser_smoke_result") {
      const candidate = this.db.rows.catalog_ingestion_candidates.find(
        (row) => row.id === params.p_candidate_id,
      );
      const issuedAt = Date.parse(String(params.p_issued_at));
      const testedAt = candidate?.browser_smoke_tested_at
        ? Date.parse(String(candidate.browser_smoke_tested_at))
        : 0;
      if (
        !candidate ||
        String(candidate.artifact_sha256).toLowerCase() !==
          String(params.p_artifact_sha256).toLowerCase() ||
        testedAt >= issuedAt
      ) {
        return { data: false, error: null };
      }
      Object.assign(candidate, {
        browser_smoke_core_id: params.p_core_id,
        browser_smoke_error:
          params.p_status === "failed" ? params.p_error : null,
        browser_smoke_status: params.p_status,
        browser_smoke_tested_at: new Date().toISOString(),
        browser_smoke_tested_by: params.p_reviewer_id,
        updated_at: new Date().toISOString(),
      });
      return { data: true, error: null };
    }

    if (fn === "claim_browser_smoke_artifact") {
      const nonce = String(params.p_nonce);
      if (this.db.browserSmokeArtifactClaims.has(nonce)) {
        return { data: false, error: null };
      }
      this.db.browserSmokeArtifactClaims.add(nonce);
      return { data: true, error: null };
    }

    if (fn === "admin_access_log_summary") {
      const page = Math.max(1, Number(params.p_page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(params.p_page_size || 25)));
      const profiles = new Map(
        this.db.rows.profiles.map((profile) => [
          profile.id,
          profile.username || null,
        ]),
      );
      const grouped = new Map<
        string,
        {
          first_seen_at: string;
          last_seen_at: string;
          sessions_count: number;
          user_id: string | null;
          username: unknown;
        }
      >();

      for (const log of this.db.rows.access_logs) {
        const userId = typeof log.user_id === "string" ? log.user_id : null;
        const groupKey = userId || "guest";
        const createdAt = String(log.created_at);
        const lastSeenAt = String(log.last_seen_at || log.created_at);
        const existing = grouped.get(groupKey);
        if (existing) {
          existing.first_seen_at =
            createdAt < existing.first_seen_at ? createdAt : existing.first_seen_at;
          existing.last_seen_at =
            lastSeenAt > existing.last_seen_at ? lastSeenAt : existing.last_seen_at;
          existing.sessions_count += 1;
        } else {
          grouped.set(groupKey, {
            first_seen_at: createdAt,
            last_seen_at: lastSeenAt,
            sessions_count: 1,
            user_id: userId,
            username: userId ? profiles.get(userId) || null : null,
          });
        }
      }

      const summaries = [...grouped.values()].sort((left, right) =>
        right.last_seen_at.localeCompare(left.last_seen_at),
      );
      const totalCount = summaries.length;
      const start = (page - 1) * pageSize;
      return {
        data: summaries.slice(start, start + pageSize).map((summary) => ({
          ...summary,
          total_count: totalCount,
        })),
        error: null,
      };
    }

    if (fn === "published_catalog_games_page") {
      const offset = Math.max(0, Number(params.p_offset || 0));
      const pageSize = Math.min(
        50,
        Math.max(1, Number(params.p_page_size || 15)),
      );
      const search =
        typeof params.p_search === "string" ? params.p_search.trim() : "";
      const rows = this.getPublishedCatalogGameRows(
        null,
        "title",
        search,
        typeof params.p_genre === "string" ? params.p_genre : "",
        typeof params.p_license_spdx === "string"
          ? params.p_license_spdx
          : "",
        typeof params.p_platform === "string" ? params.p_platform : "",
      );
      if (search) {
        const normalizedSearch = search.toLowerCase();
        rows.sort((left, right) => {
          const score = (row: RecordRow) => {
            const title = String(row.title || "").toLowerCase();
            if (title === normalizedSearch) return 0;
            if (title.startsWith(normalizedSearch)) return 1;
            if (title.includes(normalizedSearch)) {
              return 2 + title.indexOf(normalizedSearch) / 100;
            }
            return 3;
          };
          return (
            score(left) - score(right) ||
            String(left.title || "").localeCompare(String(right.title || ""))
          );
        });
      }
      const totalCount = rows.length;
      const page = rows.slice(offset, offset + pageSize);
      return {
        data:
          page.length > 0
            ? page.map((row) => ({
                ...row,
                total_count: totalCount,
              }))
            : [
                {
                  game_builds: [],
                  game_rights: [],
                  total_count: totalCount,
                },
              ],
        error: null,
      };
    }

    if (fn === "published_catalog_filters") {
      const rows = this.getPublishedCatalogGameRows(
        null,
        "title",
        "",
        "",
        "",
        "",
      );
      const genres = new Set<string>();
      const licenses = new Set<string>();
      for (const game of rows) {
        if (typeof game.genre_slug === "string") genres.add(game.genre_slug);
        for (const rights of game.game_rights as RecordRow[]) {
          if (typeof rights.code_license_spdx === "string") {
            licenses.add(rights.code_license_spdx);
          }
          if (typeof rights.asset_license_spdx === "string") {
            licenses.add(rights.asset_license_spdx);
          }
        }
      }
      return {
        data: [
          {
            genres: [...genres].sort(),
            licenses: [...licenses].sort(),
          },
        ],
        error: null,
      };
    }

    if (fn === "published_catalog_games") {
      const gameId =
        typeof params.p_game_id === "string" ? params.p_game_id : null;
      const limit = Math.min(5000, Math.max(0, Number(params.p_limit || 1000)));
      const order =
        params.p_order === "play_count_desc" ? "play_count_desc" : "title";
      const search =
        typeof params.p_search === "string" ? params.p_search.trim() : "";
      const genre = typeof params.p_genre === "string" ? params.p_genre : "";
      const license =
        typeof params.p_license_spdx === "string" ? params.p_license_spdx : "";
      const rows = this.getPublishedCatalogGameRows(
        gameId,
        order,
        search,
        genre,
        license,
        "",
      ).slice(0, limit);
      return { data: rows, error: null };
    }

    return { data: null, error: null };
  }

  private getPublishedCatalogGameRows(
    gameId: string | null,
    order: "play_count_desc" | "title",
    search: string,
    genre: string,
    license: string,
    platform: string,
  ) {
    const searchTokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    return this.db.rows.games
      .filter(
        (game) =>
          game.publication_status === "published" &&
          (!gameId || game.id === gameId) &&
          (!genre || game.genre_slug === genre) &&
          (!license || this.db.rows.game_rights.some(
            (rights) =>
              rights.game_id === game.id &&
              rights.verified_at &&
              rights.noncommercial_hosting_allowed === true &&
              (rights.code_license_spdx === license ||
                rights.asset_license_spdx === license),
          )) &&
          searchTokens.every((token) =>
            [
              game.title,
              game.author_name,
              game.developer_name,
            ].some((value) => String(value || "").toLowerCase().includes(token)),
          ),
      )
      .map((game) => {
        const verifiedBuilds = this.db.rows.game_builds.filter((build) => {
          if (build.game_id !== game.id || build.enabled !== true) return false;
          return this.db.rows.game_rights.some(
            (rights) =>
              rights.game_id === game.id &&
              rights.verified_at &&
              rights.noncommercial_hosting_allowed === true &&
              (!rights.game_build_id || rights.game_build_id === build.id),
          );
        });

        if (
          verifiedBuilds.length !== 1 ||
          (platform && verifiedBuilds[0]?.platform_id !== platform)
        ) {
          return null;
        }

        return {
          ...game,
          game_builds: verifiedBuilds,
          game_rights: this.db.rows.game_rights.filter(
            (rights) =>
              rights.game_id === game.id &&
              rights.verified_at &&
              rights.noncommercial_hosting_allowed === true,
          ),
        };
      })
      .filter((game): game is RecordRow => Boolean(game))
      .sort((left, right) => {
        if (order === "play_count_desc") {
          const playDiff =
            Number(right.play_count || 0) - Number(left.play_count || 0);
          if (playDiff !== 0) return playDiff;
        }

        return String(left.title || "").localeCompare(String(right.title || ""));
      });
  }

  private setReaction(
    table: "comment_likes" | "likes",
    targetField: "comment_id" | "game_id",
    targetId: unknown,
    params: RecordRow,
  ) {
    const existing = this.db.rows[table].find(
      (row) =>
        row.user_id === params.p_user_id && row[targetField] === targetId,
    );

    if (params.p_is_like === null) {
      this.db.rows[table] = this.db.rows[table].filter((row) => row !== existing);
    } else if (existing) {
      existing.is_like = params.p_is_like;
    } else {
      this.db.rows[table].push({
        [targetField]: targetId,
        is_like: params.p_is_like,
        user_id: params.p_user_id,
      });
    }
  }
}
