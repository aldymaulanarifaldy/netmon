import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
      logger.warn('Unauthorized access attempt', { ip: req.ip, path: req.originalUrl });
      res.sendStatus(401);
      return;
  }

  jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_do_not_use_in_prod', (err: any, user: any) => {
    if (err) {
        logger.warn('Forbidden access attempt (invalid token)', { ip: req.ip });
        res.sendStatus(403);
        return;
    }
    req.user = user;
    next();
  });
};