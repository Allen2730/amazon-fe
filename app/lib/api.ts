export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";

export type GenericRecord = Record<string, unknown>;

export type ApiEnvelope<T = GenericRecord> = {
  code?: number;
  message?: string;
  request_id?: string;
  trace_id?: string;
  data?: T;
  error?: GenericRecord;
};

export type ApiRequestOptions = {
  baseUrl: string;
  path: string;
  method?: HttpMethod;
  token?: string;
  body?: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: number;
  requestId?: string;
  traceId?: string;
  details?: GenericRecord;

  constructor(message: string, options: {
    status: number;
    code?: number;
    requestId?: string;
    traceId?: string;
    details?: GenericRecord;
  }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.traceId = options.traceId;
    this.details = options.details;
  }
}

export type SessionScope = "user" | "admin";

export type SessionState = {
  scope: SessionScope;
  baseUrl: string;
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  user: GenericRecord | null;
  organization: GenericRecord | null;
  member: GenericRecord | null;
};

export const API_PREFIX = "/api/v1";
export const STORAGE_KEY = "amazon-expert-session";
export const ADMIN_STORAGE_KEY = "amazon-expert-admin-session";
export const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export function createEmptySession(scope: SessionScope = "user"): SessionState {
  return {
    scope,
    baseUrl: DEFAULT_BASE_URL,
    accessToken: "",
    refreshToken: "",
    mustChangePassword: false,
    user: null,
    organization: null,
    member: null,
  };
}

export const EMPTY_SESSION = createEmptySession("user");
export const EMPTY_ADMIN_SESSION = createEmptySession("admin");

export function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

export function buildUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const cleanBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (normalizedPath.startsWith(API_PREFIX) || normalizedPath === "/healthz" || normalizedPath === "/metrics") {
    return `${cleanBase}${normalizedPath}`;
  }

  return `${cleanBase}${API_PREFIX}${normalizedPath}`;
}

function storageKeyForScope(scope: SessionScope): string {
  return scope === "admin" ? ADMIN_STORAGE_KEY : STORAGE_KEY;
}

export function loadSession(scope: SessionScope = "user"): SessionState {
  if (typeof window === "undefined") {
    return createEmptySession(scope);
  }

  const raw = window.localStorage.getItem(storageKeyForScope(scope));
  if (!raw) {
    return createEmptySession(scope);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    const empty = createEmptySession(scope);
    return {
      ...empty,
      ...parsed,
      scope,
      baseUrl: parsed.baseUrl || DEFAULT_BASE_URL,
      accessToken: parsed.accessToken || "",
      refreshToken: parsed.refreshToken || "",
      mustChangePassword: Boolean(parsed.mustChangePassword),
      user: (parsed.user as GenericRecord | null) || null,
      organization: (parsed.organization as GenericRecord | null) || null,
      member: (parsed.member as GenericRecord | null) || null,
    };
  } catch {
    window.localStorage.removeItem(storageKeyForScope(scope));
    return createEmptySession(scope);
  }
}

export function saveSession(session: SessionState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKeyForScope(session.scope), JSON.stringify(session));
}

export function clearSession(scope: SessionScope = "user") {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKeyForScope(scope));
}

export async function apiRequest<T = GenericRecord>({
  baseUrl,
  path,
  method = "GET",
  token,
  body,
}: ApiRequestOptions): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let payload: string | undefined;
  if (method !== "GET" && body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(baseUrl, path), {
    method,
    headers,
    body: payload,
  });

  const contentType = response.headers.get("content-type") || "";
  const envelope = contentType.includes("application/json")
    ? ((await response.json()) as ApiEnvelope<T>)
    : ({
        message: await response.text(),
      } as ApiEnvelope<T>);

  if (!response.ok) {
    throw new ApiError(envelope.message || `Request failed with status ${response.status}`, {
      status: response.status,
      code: envelope.code,
      requestId: envelope.request_id,
      traceId: envelope.trace_id,
      details: envelope.error,
    });
  }

  return envelope;
}

export function formatApiError(error: unknown, fallback = "请求失败"): string {
  if (error instanceof ApiError) {
    const lines = [
      `message: ${error.message || fallback}`,
      `status: ${error.status}`,
    ];

    if (typeof error.code === "number") {
      lines.push(`code: ${error.code}`);
    }
    if (error.requestId) {
      lines.push(`request_id: ${error.requestId}`);
    }
    if (error.traceId) {
      lines.push(`trace_id: ${error.traceId}`);
    }
    if (error.details && Object.keys(error.details).length > 0) {
      lines.push(`error: ${JSON.stringify(error.details, null, 2)}`);
    }

    return lines.join("\n");
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

export function extractAuthState(payload: ApiEnvelope<GenericRecord>): Partial<SessionState> {
  const data = payload.data;
  if (!data || typeof data !== "object") {
    return {};
  }

  const tokens = typeof data.tokens === "object" && data.tokens ? (data.tokens as GenericRecord) : null;
  const accessToken =
    typeof data.access_token === "string"
      ? data.access_token
      : typeof tokens?.access_token === "string"
        ? tokens.access_token
        : "";
  const refreshToken =
    typeof data.refresh_token === "string"
      ? data.refresh_token
      : typeof tokens?.refresh_token === "string"
        ? tokens.refresh_token
        : "";

  return {
    accessToken,
    refreshToken,
    mustChangePassword: data.must_change_password === true,
    user: (data.user as GenericRecord) || null,
    organization: (data.organization as GenericRecord) || null,
    member: (data.member as GenericRecord) || null,
  };
}

export function itemLabel(record: GenericRecord | null | undefined, ...keys: string[]): string {
  if (!record) {
    return "";
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

export function asArray(value: unknown): GenericRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is GenericRecord => typeof item === "object" && item !== null);
}
