import { JwtPayload } from 'jsonwebtoken';
import * as express from 'express';

declare module 'express-serve-static-core' {
    interface Request {
        user?: string | JwtPayload;
    }
}

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
}

declare global {
    namespace Express {
        interface Request {
            user?: string | JwtPayload;
        }
    }
}
