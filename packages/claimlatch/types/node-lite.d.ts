declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
};

declare module "node:child_process" {
  interface ChildProcessStream {
    on(event: "data", listener: (chunk: Uint8Array | string) => void): this;
  }

  interface ChildProcess {
    stdout: ChildProcessStream;
    stderr: ChildProcessStream;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close", listener: (exitCode: number | null) => void): this;
  }

  export function spawn(
    command: string,
    args: string[],
    options?: { windowsHide?: boolean },
  ): ChildProcess;
}

declare module "node:crypto" {
  export interface Hash {
    update(data: string): Hash;
    digest(encoding: "hex"): string;
  }

  export interface KeyObject {
    export(options: { type: "pkcs8" | "spki"; format: "pem" }): string;
  }

  export function generateKeyPairSync(type: "ed25519"): {
    privateKey: KeyObject;
    publicKey: KeyObject;
  };

  export function sign(
    algorithm: null,
    data: Uint8Array,
    key: string,
  ): Uint8Array;

  export function verify(
    algorithm: null,
    data: Uint8Array,
    key: string,
    signature: Uint8Array,
  ): boolean;

  export function createHash(algorithm: "sha256"): Hash;
}

declare module "node:fs/promises" {
  export function mkdtemp(prefix: string): Promise<string>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function unlink(path: string): Promise<void>;
  export function readFile(path: string | URL, encoding: "utf8"): Promise<string>;
  export function writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare module "node:http" {
  export interface IncomingMessage extends AsyncIterable<Uint8Array | string> {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    statusCode?: number;
    on(event: "data", listener: (chunk: Uint8Array | string) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "aborted", listener: () => void): this;
    removeListener(event: "aborted", listener: () => void): this;
  }

  export interface ClientRequest {
    on(event: "error", listener: (error: Error) => void): this;
    destroy(error?: Error): void;
  }

  export interface RequestOptions {
    hostname: string;
    port?: string;
    path: string;
    method: string;
    headers: Record<string, string>;
    signal?: AbortSignal;
    servername?: string;
    lookup?: (
      hostname: string,
      options: { all?: boolean; family?: number; verbatim?: boolean },
      callback: (error: Error | null, address?: string, family?: number) => void,
    ) => void;
  }

  export interface ServerResponse {
    statusCode: number;
    writableEnded: boolean;
    setHeader(name: string, value: string | number): void;
    on(event: "close", listener: () => void): this;
    removeListener(event: "close", listener: () => void): this;
    end(data?: string): void;
  }

  export interface Server {
    listen(port: number, host: string, callback?: () => void): this;
    close(callback: (error?: Error) => void): this;
    once(event: "error", listener: (error: Error) => void): this;
    removeListener(event: "error", listener: (error: Error) => void): this;
    address(): { port: number; address: string; family: string } | string | null;
  }

  export function createServer(
    listener: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
  ): Server;

  export function request(options: RequestOptions, callback: (response: IncomingMessage) => void): ClientRequest;
}

declare module "node:https" {
  import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
  export function request(options: RequestOptions, callback: (response: IncomingMessage) => void): ClientRequest;
}

declare module "node:dns/promises" {
  export interface LookupAddress {
    address: string;
    family: 4 | 6;
  }

  export function lookup(hostname: string, options: { all: true; verbatim: true }): Promise<LookupAddress[]>;
}
