export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${JSON.stringify(data)}`);
  }
  return data as T;
}

export async function fetchBuffer(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const body = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${body.toString("utf8", 0, 500)}`);
  }
  return { buffer: body, contentType };
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function endpoint(base: string, fallbackPath: string): string {
  const url = new URL(base);
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = fallbackPath;
  }
  return url.toString();
}
