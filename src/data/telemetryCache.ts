import type {
  ParsedTelemetryPayload,
  SessionTelemetryFile,
} from "./sessionTelemetry";

type CachedTelemetryPayload = {
  cached_at: string;
  file_sha256: string;
  id: string;
  parsed_storage_path: string;
  parser_version: string;
  payload: ParsedTelemetryPayload;
  schema_version: number;
};

const cacheDatabaseName = "mysetuplog-telemetry-cache";
const cacheDatabaseVersion = 1;
const cacheStoreName = "parsed-telemetry-json";
const cacheSchemaVersion = 1;

let databasePromise: Promise<IDBDatabase> | null = null;

export async function getCachedParsedTelemetryJson(
  file: SessionTelemetryFile,
): Promise<ParsedTelemetryPayload | null> {
  const database = await openTelemetryCacheDatabase();
  const cached = await idbRequest<CachedTelemetryPayload | undefined>(
    database
      .transaction(cacheStoreName, "readonly")
      .objectStore(cacheStoreName)
      .get(file.id),
  );

  if (!cached || !isFreshCacheEntry(cached, file)) return null;
  return cached.payload;
}

export async function putCachedParsedTelemetryJson(
  file: SessionTelemetryFile,
  payload: ParsedTelemetryPayload,
) {
  const database = await openTelemetryCacheDatabase();
  const cached: CachedTelemetryPayload = {
    cached_at: new Date().toISOString(),
    file_sha256: file.file_sha256,
    id: file.id,
    parsed_storage_path: file.parsed_storage_path,
    parser_version: file.parser_version,
    payload,
    schema_version: cacheSchemaVersion,
  };

  await idbRequest(
    database
      .transaction(cacheStoreName, "readwrite")
      .objectStore(cacheStoreName)
      .put(cached),
  );
}

export async function deleteCachedParsedTelemetryJson(fileId: string) {
  const database = await openTelemetryCacheDatabase();
  await idbRequest(
    database
      .transaction(cacheStoreName, "readwrite")
      .objectStore(cacheStoreName)
      .delete(fileId),
  );
}

function isFreshCacheEntry(
  cached: CachedTelemetryPayload,
  file: SessionTelemetryFile,
) {
  return (
    cached.schema_version === cacheSchemaVersion &&
    cached.file_sha256 === file.file_sha256 &&
    cached.parser_version === file.parser_version &&
    cached.parsed_storage_path === file.parsed_storage_path
  );
}

function openTelemetryCacheDatabase() {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(cacheDatabaseName, cacheDatabaseVersion);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(cacheStoreName)) {
        database.createObjectStore(cacheStoreName, { keyPath: "id" });
      }
    };
  });

  return databasePromise;
}

function idbRequest<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
