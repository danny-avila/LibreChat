import 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      role: string;
    }

    interface Request {
      user?: User;
    }
  }
}

export {}; 