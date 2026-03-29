"use strict";
/**
 * Forgejo API client – thin wrapper around fetch for Forgejo REST API v1.
 * Docs: https://forgejo.org/api/swagger
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgejoClient = exports.ForgejoError = void 0;
class ForgejoError extends Error {
    status;
    body;
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.body = body;
        this.name = "ForgejoError";
    }
}
exports.ForgejoError = ForgejoError;
class ForgejoClient {
    baseUrl;
    headers;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "") + "/api/v1";
        this.headers = {
            Authorization: `token ${config.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        };
    }
    async request(method, path, params, body) {
        let url = `${this.baseUrl}${path}`;
        if (params) {
            const query = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null) {
                    query.set(key, String(value));
                }
            }
            const qs = query.toString();
            if (qs)
                url += `?${qs}`;
        }
        const response = await fetch(url, {
            method,
            headers: this.headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
            let errorBody;
            try {
                errorBody = await response.json();
            }
            catch {
                errorBody = await response.text();
            }
            throw new ForgejoError(`Forgejo API error: ${response.status} ${response.statusText}`, response.status, errorBody);
        }
        if (response.status === 204 || response.status === 205) {
            const text = await response.text();
            if (!text)
                return {};
            return JSON.parse(text);
        }
        return response.json();
    }
    async get(path, params) {
        return this.request("GET", path, params);
    }
    async getRaw(path, params) {
        let url = `${this.baseUrl}${path}`;
        if (params) {
            const query = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null) {
                    query.set(key, String(value));
                }
            }
            const qs = query.toString();
            if (qs)
                url += `?${qs}`;
        }
        const response = await fetch(url, {
            method: "GET",
            headers: {
                ...this.headers,
                Accept: "text/plain",
            },
        });
        if (!response.ok) {
            let errorBody;
            try {
                errorBody = await response.text();
            }
            catch {
                errorBody = undefined;
            }
            throw new ForgejoError(`Forgejo API error: ${response.status} ${response.statusText}`, response.status, errorBody);
        }
        return response.text();
    }
    async post(path, body) {
        return this.request("POST", path, undefined, body);
    }
    async patch(path, body, params) {
        return this.request("PATCH", path, params, body);
    }
    async delete(path) {
        return this.request("DELETE", path);
    }
    async put(path, body, params) {
        return this.request("PUT", path, params, body);
    }
}
exports.ForgejoClient = ForgejoClient;
//# sourceMappingURL=forgejo-client.js.map