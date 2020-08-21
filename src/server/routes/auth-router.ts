import * as express from 'express';
import { handleGetClientID, handleAuth } from '../handlers/auth-handler';

export function authRouter() {
  let router = express.Router();
  router.get('/github-auth/client-id', handleGetClientID);
  router.get('/github-auth/auth', handleAuth);
  return router;
}
