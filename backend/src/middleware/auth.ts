import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = (req as any).headers['authorization'] || (req as any).get?.('Authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
      logger.warn('Unauthorized access attempt', { ip: (req as any).ip, path: (req as any).path || req.url });
      return res.status(401).send('Unauthorized');
  }

  jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_do_not_use_in_prod', (err: any, user: any) => {
    if (err) {
        logger.warn('Forbidden access attempt (invalid token)', { ip: (req as any).ip });
        return res.status(403).send('Forbidden');
    }
    (req as any).user = user;
    next();
  });
};
