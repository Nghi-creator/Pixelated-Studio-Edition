import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";
import type { OwnedAccountStorage } from "../application/deleteAccount.js";

const STORAGE_LIST_PAGE_SIZE = 100;

async function listStorageObjects(
  service: SupabaseService,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const storage = service.storage.from(bucket);
  const objectPaths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.list(prefix, {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;

    const entries = data || [];
    for (const entry of entries) {
      const objectPath = `${prefix}/${entry.name}`;
      if (entry.id) objectPaths.push(objectPath);
      else objectPaths.push(...(await listStorageObjects(service, bucket, objectPath)));
    }

    if (entries.length < STORAGE_LIST_PAGE_SIZE) return objectPaths;
    offset += STORAGE_LIST_PAGE_SIZE;
  }
}

export async function findOwnedAccountStorage(
  service: SupabaseService,
  userId: string,
): Promise<OwnedAccountStorage[]> {
  return Promise.all(
    ["avatars", "submissions"].map(async (bucket) => ({
      bucket,
      paths: await listStorageObjects(service, bucket, userId),
    })),
  );
}

export async function removeOwnedAccountStorage(
  service: SupabaseService,
  ownedStorage: OwnedAccountStorage[],
) {
  const cleanupResults = await Promise.allSettled(
    ownedStorage.map(async ({ bucket, paths }) => {
      const storage = service.storage.from(bucket);
      for (let index = 0; index < paths.length; index += STORAGE_LIST_PAGE_SIZE) {
        const { error } = await storage.remove(
          paths.slice(index, index + STORAGE_LIST_PAGE_SIZE),
        );
        if (error) throw error;
      }
    }),
  );

  return cleanupResults.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ bucket: ownedStorage[index]?.bucket, error: result.reason }]
      : [],
  );
}
