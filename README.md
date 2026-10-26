# [Bladee Heardle](https://bladeeheardle.com/)

Can also be used to create your own Heardle(s).

Forked from [Shizerq](https://github.com/Shizerq/sluchajfun) 
Clone of famous [Heardle](https://heardle.app) - "that daily music game". <br />
Uses through the YouTube iFrame API.

# Building (default React stuff)

In the project directory, you can run:

### `yarn`
Installs all the required dependencies.

### `yarn start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `yarn build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

# Keeping songs playable

YouTube videos die all the time (label takedowns, region blocks, embedding
turned off). Three layers keep the game working:

1. **Runtime fallback** — each song can list `fallbackIds` in
   `src/constants/songs.json`. If the main video errors or won't start within
   8s, the player silently switches to the next one, and reports an
   `Audio error` event to Google Analytics (song + video id + error code).
2. **Checker / self-heal** — `node scripts/check-songs.mjs` checks every
   video; `--fix` swaps dead ids for an official re-upload (prefers
   "Bladee - Topic" / drain gang uploads of the same length), and
   `--fill-fallbacks` adds backups to every song. Set `YOUTUBE_API_KEY` for
   reliable results — without it the script scrapes slowly and YouTube
   throttles after a few hundred requests. Writes `song-report.md`.
3. **Weekly GitHub Action** (`.github/workflows/check-songs.yml`) runs the
   checker and opens a PR with the swaps, plus an issue for anything it
   couldn't fix. Merging deploys via `.github/workflows/deploy.yml`.

`scripts/verify-embeds.html` is a manual ground-truth check that actually
plays every video in the embed player (`npx serve .`, open
`/scripts/verify-embeds.html`, click Start, keep the tab in front).

**Never reorder or delete songs** — the daily song is
`songs[day % songs.length]`, so that would change today's and every past
answer. Replace ids in place; append new songs at the end (appending also
shifts the rotation, so do it right after midnight).

Dev tip: `npm start` then `/?day=N` previews rotation day N.
