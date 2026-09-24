"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, doc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "../../../lib/firebase";

type Difficulty = "Easy" | "Medium" | "Hard";

type ImportedProblem = {
  id: string;
  title: string;
  slug: string;
  topics: string[];
  difficulty: string;
  lastSolvedAt: string;
};

type ExtensionSnapshot = {
  username: string;
  profileUrl: string;
  capturedAt: string;
  stats: {
    solved: number;
    easy: number;
    medium: number;
    hard: number;
    streak: number;
    totalActiveDays: number;
    submissionCalendar: string;
    topicStats: Array<{ name: string; slug: string; solved: number }>;
  };
  recentProblems: ImportedProblem[];
};

type Problem = {
  id: number;
  title: string;
  slug: string;
  topics: string[];
  leetDifficulty: Difficulty;
  personalDifficulty: Difficulty;
  lastSolved: string;
  nextReview: string;
  status: "Due today" | "Due soon" | "Scheduled";
  confidence: number;
  reviewed: boolean;
};

function toProblem(item: ImportedProblem, index: number, existing?: Problem): Problem {
  const difficulty = item.difficulty === "Easy" || item.difficulty === "Hard" ? item.difficulty : "Medium";
  return {
    id: Number(item.id) || index + 1,
    title: item.title,
    slug: item.slug,
    topics: item.topics.length ? item.topics : ["Uncategorized"],
    leetDifficulty: difficulty,
    personalDifficulty: existing?.personalDifficulty || difficulty,
    lastSolved: new Date(item.lastSolvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    nextReview: existing?.nextReview || "Today",
    status: existing?.status || (index < 3 ? "Due today" : "Due soon"),
    confidence: existing?.confidence || 50,
    reviewed: existing?.reviewed || false,
  };
}

export default function ExtensionImportPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [snapshot, setSnapshot] = useState<ExtensionSnapshot | null>(null);
  const [existingProblems, setExistingProblems] = useState<Problem[]>([]);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState("Waiting for the Brainstorm extension…");
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setAuthUser(user);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (!authUser) return;
    void getDocs(collection(db, "users", authUser.uid, "problems")).then((result) => {
      setExistingProblems(result.docs.map((item) => item.data() as Problem));
    }).catch(() => setError("Your Brainstorm workspace could not be loaded."));
  }, [authUser]);

  useEffect(() => {
    const receiveSnapshot = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "brainstorm-extension") return;
      if (event.data.type !== "SNAPSHOT") return;
      setSnapshot(event.data.snapshot as ExtensionSnapshot);
      setStatus("Snapshot ready to review.");
      setError("");
    };
    window.addEventListener("message", receiveSnapshot);
    window.postMessage({ source: "brainstorm-site", type: "REQUEST_PENDING_SNAPSHOT" }, "*");
    return () => window.removeEventListener("message", receiveSnapshot);
  }, []);

  const importSnapshot = async () => {
    if (!authUser || !snapshot) return;
    setImporting(true);
    setError("");
    try {
      const existingBySlug = new Map(existingProblems.map((problem) => [problem.slug, problem]));
      const nextProblems = snapshot.recentProblems.map((item, index) => toProblem(item, index, existingBySlug.get(item.slug)));
      await setDoc(doc(db, "users", authUser.uid), {
        email: authUser.email,
        displayName: authUser.displayName,
        profileUrl: snapshot.profileUrl,
        leetcodeUsername: snapshot.username,
        stats: snapshot.stats,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      for (let index = 0; index < nextProblems.length; index += 450) {
        const batch = writeBatch(db);
        nextProblems.slice(index, index + 450).forEach((problem) => batch.set(doc(db, "users", authUser.uid, "problems", problem.slug), problem, { merge: true }));
        await batch.commit();
      }
      window.localStorage.setItem("brainstorm-stats", JSON.stringify(snapshot.stats));
      window.localStorage.setItem("brainstorm-problems", JSON.stringify(nextProblems));
      window.postMessage({ source: "brainstorm-site", type: "IMPORT_COMPLETE" }, "*");
      setExistingProblems(nextProblems);
      setStatus(`Imported ${nextProblems.length} recent problems and updated your profile.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The import could not be saved.");
    } finally {
      setImporting(false);
    }
  };

  if (!authReady) return <main className="extension-import-shell"><div className="extension-import-card"><div className="auth-brand">brainstorm</div><div className="auth-spinner" /><p>Preparing your import workspace…</p></div></main>;
  if (!authUser) return <main className="extension-import-shell"><div className="extension-import-card"><div className="auth-brand">brainstorm</div><p className="eyebrow">BROWSER EXTENSION</p><h1>Sign in before importing.</h1><p className="auth-copy">Open Brainstorm in another tab, sign in with Google, then return here to import the snapshot from the extension.</p><Link className="google-button extension-link" href="/">Open Brainstorm <span>→</span></Link></div></main>;

  return <main className="extension-import-shell"><div className="extension-import-card"><div className="auth-brand">brainstorm</div><p className="eyebrow">BROWSER EXTENSION</p><h1>Review your import.</h1><p className="auth-copy">This preview is linked to {authUser.email || "your Brainstorm account"}. Personal difficulty and review history will be preserved.</p>{snapshot ? <><div className="extension-stat-grid"><div><strong>{snapshot.stats.solved}</strong><span>solved</span></div><div><strong>{snapshot.stats.topicStats.length}</strong><span>topics</span></div><div><strong>{snapshot.recentProblems.length}</strong><span>recent problems</span></div></div><div className="extension-preview"><strong>{snapshot.username}</strong><span>Captured {new Date(snapshot.capturedAt).toLocaleString()}</span><p>{snapshot.recentProblems.length ? "The latest accepted problem titles will be merged into your revision workspace." : "Only profile summary data was returned. Your existing problem history will be preserved."}</p></div><button className="google-button extension-link" onClick={importSnapshot} disabled={importing}>{importing ? "Importing…" : "Import into Brainstorm →"}</button></> : <div className="extension-waiting"><div className="auth-spinner" /><p>{status}</p><small>Keep this tab open while you send a snapshot from the extension popup.</small></div>}{error && <div className="form-error" role="alert">{error}</div>}{status && snapshot && <p className="extension-status">{status}</p>}<Link className="plain-button extension-back" href="/">Return to Brainstorm</Link></div></main>;
}
