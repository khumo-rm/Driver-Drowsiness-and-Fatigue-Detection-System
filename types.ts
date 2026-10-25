declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: 'DRIVER' | 'ADMIN' };
      device?: { id: string; ownerId: string };
    }
  }
}
export {};
