/**
 * Minimal type shim for @photon-ai/advanced-imessage (ESM-only package).
 * Full types are in the package itself; this allows tsc to resolve imports
 * under "module": "commonjs" without changing moduleResolution.
 */
declare module "@photon-ai/advanced-imessage" {
  type ChatGuid = string & { readonly __brand: "ChatGuid" };

  interface SendResult {
    guid: string;
  }

  interface MessagesResource {
    send(chat: ChatGuid, text: string, options?: Record<string, unknown>): Promise<SendResult>;
  }

  interface AdvancedIMessage {
    messages: MessagesResource;
    close(): Promise<void>;
  }

  interface ClientOptions {
    address: string;
    token: string;
    tls?: boolean;
    timeout?: number;
    autoIdempotency?: boolean;
    retry?: boolean;
  }

  export function createClient(options: ClientOptions): AdvancedIMessage;
  export function directChat(phoneNumber: string): ChatGuid;
}
