import { JwtPayload } from 'jsonwebtoken';
import * as express from 'express';

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

declare module 'routeros-client' {
    export interface RouterOSClientOptions {
        host: string;
        user?: string;
        password?: string;
        port?: number;
        keepalive?: boolean;
        timeout?: number;
    }

    export class RouterOSClient {
        constructor(options: RouterOSClientOptions);
        connect(): Promise<void>;
        close(): Promise<void>;
        menu(path: string): RouterOSMenu;
    }
    
    export interface RouterOSMenu {
        get(criteria?: any): Promise<any[]>;
        monitor(items: string[], options?: any): any; // Stream object
    }
}

declare global {
    namespace Express {
        interface Request {
            user?: string | JwtPayload;
        }
    }
}