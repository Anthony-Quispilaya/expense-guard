/**
 * Minimal type shim for spectrum-ts (ESM-only package, v0.4.x).
 * We import via dynamic `await import()` at runtime. These types keep tsc happy
 * under "module": "commonjs" without switching moduleResolution.
 * Real types live in node_modules/spectrum-ts/dist/*.d.ts.
 */
declare module "spectrum-ts" {
  export type ContentInput = string | { readonly __content: true };

  export interface Space {
    readonly id: string;
    send(...content: ContentInput[]): Promise<void>;
    startTyping(): Promise<void>;
    stopTyping(): Promise<void>;
  }

  export interface User {
    readonly id: string;
  }

  export interface Message {
    readonly id: string;
    content: { type: string; text?: string };
    sender: User;
    space: Space;
    platform: string;
    timestamp: Date;
  }

  export interface SpectrumInstance {
    readonly messages: AsyncIterable<[Space, Message]>;
    stop(): Promise<void>;
    send(space: Space, ...content: ContentInput[]): Promise<void>;
  }

  export function Spectrum(options: {
    projectId?: string;
    projectSecret?: string;
    providers: unknown[];
  }): Promise<SpectrumInstance>;

  export function text(s: string): ContentInput;
  export function attachment(
    input: string | Buffer,
    options?: { mimeType?: string; name?: string }
  ): ContentInput;
}

declare module "spectrum-ts/providers/imessage" {
  import type { SpectrumInstance, Space, User } from "spectrum-ts";

  export interface IMessageInstance {
    user(phoneNumber: string): Promise<User>;
    space(...users: User[]): Promise<Space>;
  }

  export interface IMessageConfigOptions {
    local?: boolean;
    clients?:
      | { address: string; token: string }
      | Array<{ address: string; token: string }>;
  }

  interface IMessageProvider {
    config(options?: IMessageConfigOptions): unknown;
    (app: SpectrumInstance): IMessageInstance;
    (space: Space): Space & { type: "dm" | "group" };
    readonly tapbacks: {
      readonly love: "love";
      readonly like: "like";
      readonly dislike: "dislike";
      readonly laugh: "laugh";
      readonly emphasize: "emphasize";
      readonly question: "question";
    };
  }

  export const imessage: IMessageProvider;
}
