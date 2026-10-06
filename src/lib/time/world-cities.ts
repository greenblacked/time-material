import { type CityOption } from "./cities.ts";

export type WorldCity = CityOption & { cityId?: string };
export type CityRow = [string, string, string, string, string, string, number];
export { cityBucket, matchingCityRows, normalizeCity } from "./world-city-search.ts";
export type CityPage = { cities: WorldCity[]; total: number };
export type CitySearchRequest = {
  query: string;
  offset: number;
  limit: number;
  excluded: string[];
};
let worker: Worker | undefined;
let requestId = 0;
const pending = new Map<
  number,
  { resolve: (page: CityPage) => void; reject: (error: Error) => void }
>();
function searchWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./world-cities.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<{ id: number; page?: CityPage; error?: string }>) => {
    const task = pending.get(event.data.id);
    if (!task) return;
    pending.delete(event.data.id);
    if (event.data.page) task.resolve(event.data.page);
    else task.reject(new Error(event.data.error ?? "City search unavailable."));
  };
  worker.onerror = () => {
    worker?.terminate();
    worker = undefined;
    for (const task of pending.values()) task.reject(new Error("City search unavailable."));
    pending.clear();
  };
  return worker;
}
export async function searchWorldCities(
  query: string,
  offset = 0,
  limit = 40,
  excluded: string[] = [],
  signal?: AbortSignal,
): Promise<CityPage> {
  const request: CitySearchRequest = { query, offset, limit, excluded };
  if (typeof Worker === "undefined") {
    const { searchCityPage } = await import("./world-city-engine.ts");
    return searchCityPage(request);
  }
  if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
  const target = searchWorker();
  const id = ++requestId;
  return new Promise<CityPage>((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      reject(new DOMException("Search cancelled", "AbortError"));
    };
    const cleanup = () => signal?.removeEventListener("abort", abort);
    pending.set(id, {
      resolve: (page) => {
        cleanup();
        resolve(page);
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
    });
    signal?.addEventListener("abort", abort, { once: true });
    try {
      target.postMessage({ id, request });
    } catch {
      pending.delete(id);
      cleanup();
      reject(new Error("City search unavailable."));
    }
  });
}
