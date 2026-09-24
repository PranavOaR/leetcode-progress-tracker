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

## Browser companion extension

The local Manifest V3 companion lives in `extension/`. It provides a compact progress popup and a reviewed import handoff into the signed-in Brainstorm workspace.

```bash
npm run dev
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the `extension` folder. The popup defaults to `http://localhost:3000`; change its Brainstorm site field to the deployed Vercel URL for production.

The extension does not request or store LeetCode passwords, cookies, or session tokens.

## Checks

```bash
npm run lint
npm run build
```
