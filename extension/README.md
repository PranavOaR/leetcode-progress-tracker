# Brainstorm browser companion

This is a local Manifest V3 companion extension for Chrome or Chromium-based browsers.

## Load locally

1. Start Brainstorm with `npm run dev`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this `extension` folder.
6. Open the Brainstorm extension popup.
7. Enter a public LeetCode profile URL.
8. Click **Sync progress**.
9. Click **Send to Brainstorm**.
10. Review the import page and confirm the import while signed into Brainstorm.

The popup defaults to `http://localhost:3000`. In production, change the Brainstorm site field to the deployed Vercel URL.

The extension only requests profile data through Brainstorm's public profile route. It does not request or store LeetCode passwords, cookies, or session tokens.
