import { useEffect, useState } from "react";
import type { BasinResult, MapResult, WorkerRequest } from "../workers/compute.worker";

type Result = MapResult | BasinResult;

/** Runs one request in a fresh worker; result is null until it arrives. */
export function useWorker<R extends Result>(request: WorkerRequest | null, key: string): R | null {
  const [result, setResult] = useState<R | null>(null);
  useEffect(() => {
    if (!request) return;
    setResult(null);
    const worker = new Worker(new URL("../workers/compute.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<R>) => {
      setResult(e.data);
      worker.terminate();
    };
    worker.postMessage(request);
    return () => worker.terminate();
    // the request is identified by its key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result;
}
