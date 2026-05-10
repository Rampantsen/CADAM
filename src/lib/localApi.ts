import { Content, Message, Model } from '@shared/types';
import { createId } from '@/lib/ids';

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const LOCAL_ACCESS_TOKEN_KEY = 'cadam_local_access_token';

export const isLocalApiConfigMissing = !rawApiBaseUrl;
export const isLocalApiEnabled = !!rawApiBaseUrl;

export type LocalApiEndpoint = `/${string}` | string;

export type LocalApiRequestOptions = {
  headers?: HeadersInit;
  signal?: AbortSignal;
  accessToken?: string;
  includeAuth?: boolean;
};

export class LocalApiError extends Error {
  status: number;
  statusText: string;

  constructor(message: string, status: number, statusText: string) {
    super(message);
    this.name = 'LocalApiError';
    this.status = status;
    this.statusText = statusText;
  }
}

function createLocalApiError(prefix: string, response: Response) {
  return new LocalApiError(
    `${prefix}: ${response.status} ${response.statusText}`,
    response.status,
    response.statusText,
  );
}

export type JsonLineParseError = {
  line: string;
  error: unknown;
};

export type JsonLineStreamOptions<T> = {
  onItem?: (item: T) => void | Promise<void>;
  onParseError?: (error: JsonLineParseError) => void;
};

export type MultipartValue =
  | Blob
  | File
  | string
  | number
  | boolean
  | null
  | undefined;

export type MultipartFields = Record<string, MultipartValue | MultipartValue[]>;

export type MultipartFile = {
  field: string;
  file: Blob | File;
  filename?: string;
};

export type LocalChatRequest = {
  conversationId: string;
  messageId: string;
  model: Model;
  newMessageId?: string;
};

export type GenerateTitleRequest = {
  conversationId: string;
  content: Content;
};

export type GenerateTitleResponse = {
  title?: string;
};

export type LocalAuthUser = {
  id: string;
  username: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LocalProfile = {
  id: string;
  user_id: string;
  full_name: string;
  avatar_path: string | null;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type LocalAuthResponse = {
  access_token: string;
  token_type: string;
  user: LocalAuthUser;
  profile: LocalProfile;
};

export type LocalAsset = {
  id: string;
  user_id: string;
  conversation_id: string;
  prompt: Record<string, unknown> | null;
  status: string;
  path: string | null;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type LocalImageAsset = LocalAsset & {
  image_generation_call_id?: string | null;
};

export type LocalMeshAsset = LocalAsset & {
  file_type: string;
  images?: string[] | null;
};

export type LocalPreviewAsset = LocalAsset & {
  mesh_id: string | null;
  updated_at: string;
};

export type LocalFileCollection = {
  images: LocalImageAsset[];
  meshes: LocalMeshAsset[];
  previews: LocalPreviewAsset[];
};

function getLocalApiBaseUrl() {
  if (!rawApiBaseUrl) {
    throw new Error('VITE_API_BASE_URL is required for local API requests');
  }

  return rawApiBaseUrl.replace(/\/+$/, '');
}

function normalizeEndpoint(endpoint: LocalApiEndpoint) {
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}

export function localApiUrl(endpoint: LocalApiEndpoint) {
  return `${getLocalApiBaseUrl()}${normalizeEndpoint(endpoint)}`;
}

export function getLocalAccessToken() {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem(LOCAL_ACCESS_TOKEN_KEY) ?? undefined;
}

export function setLocalAccessToken(token: string) {
  localStorage.setItem(LOCAL_ACCESS_TOKEN_KEY, token);
}

export function clearLocalAccessToken() {
  localStorage.removeItem(LOCAL_ACCESS_TOKEN_KEY);
}

async function getAuthorizationHeader(options: LocalApiRequestOptions) {
  if (options.includeAuth === false) return undefined;

  const token = options.accessToken ?? getLocalAccessToken();

  return token ? `Bearer ${token}` : undefined;
}

export async function localApiFetch(
  endpoint: LocalApiEndpoint,
  init: RequestInit = {},
  options: LocalApiRequestOptions = {},
) {
  const headers = new Headers(options.headers);

  for (const [key, value] of new Headers(init.headers)) {
    headers.set(key, value);
  }

  const authorization = await getAuthorizationHeader(options);
  if (authorization && !headers.has('Authorization')) {
    headers.set('Authorization', authorization);
  }

  return fetch(localApiUrl(endpoint), {
    ...init,
    headers,
    signal: options.signal ?? init.signal,
  });
}

export async function localApiJson<TResponse, TBody = unknown>(
  endpoint: LocalApiEndpoint,
  body?: TBody,
  options: LocalApiRequestOptions = {},
) {
  const response = await localApiFetch(
    endpoint,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    options,
  );

  if (!response.ok) {
    throw createLocalApiError('Local API request failed', response);
  }

  return (await response.json()) as TResponse;
}

export async function localApiRequestJson<TResponse, TBody = unknown>(
  endpoint: LocalApiEndpoint,
  init: {
    method?: string;
    body?: TBody;
  } = {},
  options: LocalApiRequestOptions = {},
) {
  const response = await localApiFetch(
    endpoint,
    {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers:
        init.body === undefined
          ? undefined
          : {
              'Content-Type': 'application/json',
            },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    options,
  );

  if (!response.ok) {
    throw createLocalApiError('Local API request failed', response);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

export function createMultipartFormData(
  fields: MultipartFields = {},
  files: MultipartFile[] = [],
) {
  const formData = new FormData();

  for (const [key, rawValue] of Object.entries(fields)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    for (const value of values) {
      if (value === undefined || value === null) continue;
      formData.append(
        key,
        value instanceof Blob ? value : String(value),
      );
    }
  }

  for (const { field, file, filename } of files) {
    formData.append(field, file, filename);
  }

  return formData;
}

export async function localApiMultipart<TResponse>(
  endpoint: LocalApiEndpoint,
  fields: MultipartFields = {},
  files: MultipartFile[] = [],
  options: LocalApiRequestOptions = {},
) {
  const response = await localApiFetch(
    endpoint,
    {
      method: 'POST',
      body: createMultipartFormData(fields, files),
    },
    options,
  );

  if (!response.ok) {
    throw createLocalApiError('Local API upload failed', response);
  }

  return (await response.json()) as TResponse;
}

export async function* parseLineDelimitedJsonStream<T>(
  stream: ReadableStream<Uint8Array>,
  options: JsonLineStreamOptions<T> = {},
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let leftover = '';

  async function emitLine(rawLine: string) {
    const line = rawLine.trim();
    if (!line) return undefined;

    try {
      const item = JSON.parse(line) as T;
      await options.onItem?.(item);
      return item;
    } catch (error) {
      if (options.onParseError) {
        options.onParseError({ line, error });
        return undefined;
      }
      throw error;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      leftover += decoder.decode(value, { stream: true });
      const lines = leftover.split('\n');
      leftover = lines.pop() ?? '';

      for (const line of lines) {
        const item = await emitLine(line);
        if (item !== undefined) yield item;
      }
    }

    leftover += decoder.decode();
    const item = await emitLine(leftover);
    if (item !== undefined) yield item;
  } finally {
    reader.releaseLock();
  }
}

export async function streamLocalJsonLines<T>(
  endpoint: LocalApiEndpoint,
  body: unknown,
  options: LocalApiRequestOptions & JsonLineStreamOptions<T> = {},
) {
  const response = await localApiFetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    options,
  );

  if (!response.ok) {
    throw createLocalApiError('Local API stream failed', response);
  }

  if (response.headers.get('Content-Type')?.includes('application/json')) {
    return (await response.json()) as T;
  }

  if (!response.body) {
    throw new Error('Local API stream response has no body');
  }

  let finalItem: T | null = null;

  for await (const item of parseLineDelimitedJsonStream<T>(response.body, {
    onItem: options.onItem,
    onParseError: options.onParseError,
  })) {
    finalItem = item;
  }

  if (!finalItem) {
    throw new Error('No final stream item received');
  }

  return finalItem;
}

export function sendLocalChat(
  endpoint: LocalApiEndpoint,
  request: LocalChatRequest,
  options?: LocalApiRequestOptions & JsonLineStreamOptions<Message>,
) {
  return streamLocalJsonLines<Message>(
    endpoint,
    {
      ...request,
      newMessageId: request.newMessageId ?? createId(),
    },
    options,
  );
}

export function generateLocalConversationTitle(
  request: GenerateTitleRequest,
  options?: LocalApiRequestOptions,
) {
  return localApiJson<GenerateTitleResponse, GenerateTitleRequest>(
    '/api/v1/title-generator',
    request,
    options,
  );
}

export function listLocalConversationFiles(
  conversationId: string,
  options?: LocalApiRequestOptions,
) {
  return localApiJson<LocalFileCollection>(
    `/api/v1/conversations/${conversationId}/files`,
    undefined,
    options,
  );
}

export function localConversationFileDownloadUrl(
  conversationId: string,
  kind: 'images' | 'meshes' | 'previews',
  assetId: string,
) {
  return localApiUrl(
    `/api/v1/conversations/${conversationId}/files/${kind}/${assetId}/download`,
  );
}

export async function downloadLocalConversationFile(
  conversationId: string,
  kind: 'images' | 'meshes' | 'previews',
  assetId: string,
  options?: LocalApiRequestOptions,
) {
  const response = await localApiFetch(
    `/api/v1/conversations/${conversationId}/files/${kind}/${assetId}/download`,
    undefined,
    options,
  );

  if (!response.ok) {
    throw createLocalApiError('Local API download failed', response);
  }

  return response.blob();
}

export function uploadLocalConversationImage(
  conversationId: string,
  file: File,
  options?: LocalApiRequestOptions,
) {
  return localApiMultipart<LocalImageAsset>(
    `/api/v1/conversations/${conversationId}/files/images`,
    {},
    [{ field: 'file', file, filename: file.name }],
    options,
  );
}

export function uploadLocalConversationMesh(
  conversationId: string,
  file: File,
  options?: LocalApiRequestOptions,
) {
  return localApiMultipart<LocalMeshAsset>(
    `/api/v1/conversations/${conversationId}/files/meshes`,
    {},
    [{ field: 'file', file, filename: file.name }],
    options,
  );
}

export function loginLocal(username: string, password: string) {
  return localApiJson<LocalAuthResponse, { username: string; password: string }>(
    '/api/v1/auth/login',
    { username, password },
    { includeAuth: false },
  );
}

export function registerLocal(
  username: string,
  password: string,
  fullName: string,
) {
  return localApiJson<
    LocalAuthResponse,
    { username: string; password: string; full_name: string }
  >(
    '/api/v1/auth/register',
    { username, password, full_name: fullName },
    { includeAuth: false },
  );
}
