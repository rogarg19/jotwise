# BodhiNote

Local-first intelligent single-note prototype for iOS and Android.

## What Is Implemented

- One always-open capture surface for dumping thoughts.
- Local SQLite storage.
- SQLite FTS5 search index for fast text/context search.
- Automatic date buckets behind the scenes.
- Timeline view by day.
- Local topic extraction.
- Local task/action extraction.
- Daily summaries.
- Native speech-to-text capture using `expo-speech-recognition`.
- Minimal mobile-first UX.

The app is intentionally offline-first. Cloud sync, embeddings, account auth, and hosted AI are future backend layers rather than required for this local prototype.

## Local Architecture

```text
React Native / Expo app
  |
  |-- App.tsx
      |-- capture UI
      |-- search UI
      |-- timeline UI
      |-- insights UI
      |-- speech recognition events
      |-- local topic/task extraction
      |
      |-- SQLite database
          |-- entries table
          |-- entries_fts FTS5 virtual table
          |-- insert/delete triggers keep search index current
```

## Run Locally

Install dependencies:

```bash
npm install
```

Start Metro for Expo Go:

```bash
npm start
```

Open Expo Go on your phone and scan the QR code from inside Expo Go on Android, or with the Camera app on iOS. Text capture, SQLite storage, search, timeline, and insights run there.

If scanning the QR code does not open anything, your phone probably cannot reach the Metro server on the local network. Make sure the phone and computer are on the same Wi-Fi network, disable VPNs or firewalls that block local traffic, then restart Metro with:

```bash
npm run tunnel
```

The tunnel QR is slower, but it works across networks that block LAN discovery.

Start Metro for a native development build:

```bash
npm run dev:client
```

Run Android dev build:

```bash
npm run android:dev
```

Run iOS dev build on macOS:

```bash
npm run ios:dev
```

Native speech recognition requires a development build because the app uses config plugins and native permissions.

## Verification

```bash
npm run typecheck
```

## Next Production Layers

- Auth and encrypted sync.
- Backend Postgres canonical event store.
- pgvector semantic search.
- Embeddings for note chunks.
- Cloud transcription fallback.
- RAG answers over note history.
- End-to-end encryption option.
- Desktop/web clients sharing the same API.
