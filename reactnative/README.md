# Pulsebox React Native

This app lives in `reactnative/` and reuses the root `../.env` through `app.config.ts`.

## What it implements

- library home screen
- favorites screen
- playlist detail screen
- create playlist
- rename playlist
- delete playlist
- add song
- fix YouTube match
- remove song
- like/unlike song
- Spotify public playlist preview + sync
- YouTube direct search
- native audio playback with queue controls
- YouTube video modal playback

## Run

```bash
cd reactnative
npm install
npm start
```

Then open with Expo Go or run a native build:

```bash
npm run android
npm run ios
```

## Notes

- The app uses the same Supabase and RapidAPI values from the root `.env`.
- The web app's relative `/api/...` routes are implemented natively here against Supabase, RapidAPI, and YouTube.
- Because the RapidAPI keys are compiled into the mobile app config, this is functional but not secret-safe for public distribution. A production mobile release should move those calls behind a secured backend.
