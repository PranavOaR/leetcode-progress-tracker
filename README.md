# Brainstorm

Brainstorm is a personal LeetCode progress workspace built with Next.js, Firebase Authentication, Firestore, and Vercel.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the Firebase Web App values before using Google sign-in. The file is intentionally ignored by Git.

## Firebase setup

1. Enable Google under Firebase Authentication → Sign-in method.
2. Create the Firestore database in production mode.
3. Publish [firestore.rules](./firestore.rules) in the Firebase console.
4. Add the variables in `.env.example` to the Vercel project settings.

## LeetCode import note

The server route at `/api/leetcode/profile` imports the public profile summary, solved counts, calendar data, and recent accepted submissions. LeetCode does not expose a complete historical solved-problem list through a public profile URL alone, so a future authenticated import or export-file flow is needed to populate every historical problem.

## Checks

```bash
npm run lint
npm run build
```
