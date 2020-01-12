import * as path from 'path';
import * as express from 'express';

export function staticsRouter(): express.Router {
  let router = express.Router();
  let publicPath = path.join(__dirname, '..', '..', 'public');

  // All the assets are in "public" folder (Done by Webpack)
  router.use('/public', express.static(publicPath));

  // Any route without a dot should render the web app html (Generated by Webpack)
  router.get('*.*', (request, response) => response.sendStatus(404));
  router.get('**', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

  return router;
}
