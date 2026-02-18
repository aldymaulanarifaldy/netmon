export const logger = {
  info: (msg: string, meta?: any) => {
    console.log(JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), msg, ...meta }));
  },
  error: (msg: string, meta?: any) => {
    console.error(JSON.stringify({ level: 'error', timestamp: new Date().toISOString(), msg, ...meta }));
  },
  warn: (msg: string, meta?: any) => {
    console.warn(JSON.stringify({ level: 'warn', timestamp: new Date().toISOString(), msg, ...meta }));
  },
  debug: (msg: string, meta?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify({ level: 'debug', timestamp: new Date().toISOString(), msg, ...meta }));
    }
  }
};