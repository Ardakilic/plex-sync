import updateNotifier from 'update-notifier';

import { exitUsage, log, parseCLIArg, progressMap } from './ui';
import { fetchMovies, markWatched } from './plex';
import pkg from '../package.json';

import './env';

updateNotifier({ pkg }).notify();

const DRY_RUN = !!process.env.DRY_RUN;
const FUZZY = (process.env.MATCH_TYPE || 'fuzzy') === 'fuzzy';

if (process.argv.length < 4) {
  exitUsage();
}

const servers = process.argv.slice(2).map(parseCLIArg);

(async () => {
  try {
    log(`Reading data from ${servers.map(server => server.host).join(', ')}...`);

    const movies = await progressMap(
      servers,
      server => fetchMovies(server, FUZZY)
    );

    const watched = new Set();

    for (const [idx, serverMovies] of movies.entries()) {
      const server = servers[idx];

      if (server.mode.read) {
        serverMovies.forEach((movie) => {
          if (movie.watched) watched.add(movie.guid);
        });
      }
    }

    log('Syncing any unsynced media...');

    for (const [idx, serverMovies] of movies.entries()) {
      const server = servers[idx];

      if (server.mode.write) {
        const needsSync = serverMovies.filter(
          movie => !movie.watched && watched.has(movie.guid)
        );

        await progressMap(
          needsSync,
          (media) => {
            if (DRY_RUN) {
              log(`Dry run: marking ${media.title} watched on ${server.host}`);
              return;
            }

            markWatched(server, media);
          }
        );
      }
    }

    log('Sync completed!');
  } catch (e) {
    log(e.stack);
  }
})();
