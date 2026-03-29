/**
 * Forgejo API client – thin wrapper around fetch for Forgejo REST API v1.
 * Docs: https://forgejo.org/api/swagger
 */
export interface ForgejoConfig {
    baseUrl: string;
    token: string;
}
export declare class ForgejoError extends Error {
    readonly status: number;
    readonly body: unknown;
    constructor(message: string, status: number, body: unknown);
}
export declare class ForgejoClient {
    private readonly baseUrl;
    private readonly headers;
    constructor(config: ForgejoConfig);
    private request;
    get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
    getRaw(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<string>;
    post<T>(path: string, body?: unknown): Promise<T>;
    patch<T>(path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
    delete<T>(path: string): Promise<T>;
    put<T>(path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
}
//# sourceMappingURL=forgejo-client.d.ts.map