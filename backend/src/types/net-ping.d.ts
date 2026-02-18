declare module 'net-ping' {
    export interface SessionOptions {
        networkProtocol?: number;
        packetSize?: number;
        retries?: number;
        sessionId?: number;
        timeout?: number;
        ttl?: number;
    }

    export interface Session {
        pingHost(target: string, callback: (error: Error | null, target: string, sent?: Date, rcvd?: Date) => void): void;
        close(): void;
    }

    export function createSession(options?: SessionOptions): Session;

    export const NetworkProtocol: {
        IPv4: number;
        IPv6: number;
    };
}