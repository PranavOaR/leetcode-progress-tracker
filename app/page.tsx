"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type Difficulty = "Easy" | "Medium" | "Hard";
type View = "overview" | "topics" | "revision" | "progress";

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

type ImportedStats = {
  solved: number;
  easy: number;
  medium: number;
  hard: number;
  streak: number;
  totalActiveDays: number;
  submissionCalendar: string;
};

const seedProblems: Problem[] = [
  { id: 1, title: "Longest Substring Without Repeating Characters", slug: "longest-substring-without-repeating-characters", topics: ["Strings", "Sliding Window"], leetDifficulty: "Medium", personalDifficulty: "Hard", lastSolved: "Sep 22, 2026", nextReview: "Today", status: "Due today", confidence: 58, reviewed: false },
  { id: 2, title: "Product of Array Except Self", slug: "product-of-array-except-self", topics: ["Arrays", "Prefix Sum"], leetDifficulty: "Medium", personalDifficulty: "Medium", lastSolved: "Sep 20, 2026", nextReview: "Today", status: "Due today", confidence: 73, reviewed: false },
  { id: 3, title: "Merge Intervals", slug: "merge-intervals", topics: ["Arrays", "Sorting"], leetDifficulty: "Medium", personalDifficulty: "Medium", lastSolved: "Sep 18, 2026", nextReview: "Tomorrow", status: "Due soon", confidence: 81, reviewed: false },
  { id: 4, title: "Binary Tree Level Order Traversal", slug: "binary-tree-level-order-traversal", topics: ["Trees", "BFS"], leetDifficulty: "Medium", personalDifficulty: "Easy", lastSolved: "Sep 16, 2026", nextReview: "Sep 28", status: "Scheduled", confidence: 89, reviewed: true },
  { id: 5, title: "Coin Change", slug: "coin-change", topics: ["Dynamic Programming"], leetDifficulty: "Medium", personalDifficulty: "Hard", lastSolved: "Sep 14, 2026", nextReview: "Sep 28", status: "Scheduled", confidence: 44, reviewed: false },
  { id: 6, title: "Number of Islands", slug: "number-of-islands", topics: ["Graphs", "DFS"], leetDifficulty: "Medium", personalDifficulty: "Hard", lastSolved: "Sep 11, 2026", nextReview: "Sep 30", status: "Scheduled", confidence: 67, reviewed: true },
];

const topicData = [
  { name: "Arrays", count: 42, total: 60, color: "blue", trend: "+8%" },
  { name: "Strings", count: 28, total: 45, color: "violet", trend: "+12%" },
  { name: "Trees", count: 19, total: 40, color: "orange", trend: "+4%" },
  { name: "Graphs", count: 12, total: 35, color: "green", trend: "+16%" },
  { name: "Dynamic Programming", count: 8, total: 30, color: "pink", trend: "+2%" },
  { name: "Two Pointers", count: 16, total: 22, color: "cyan", trend: "+10%" },
];

function getSavedProblems() {
  if (typeof window === "undefined") return seedProblems;
  const saved = window.localStorage.getItem("brainstorm-problems");
  return saved ? JSON.parse(saved) as Problem[] : seedProblems;
}

function getSavedProfile() {
  if (typeof window === "undefined") return { url: "https://leetcode.com/u/pranav/", name: "pranav" };
  const saved = window.localStorage.getItem("brainstorm-profile");
  return saved ? JSON.parse(saved) as { url: string; name: string } : { url: "https://leetcode.com/u/pranav/", name: "pranav" };
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    layers: <><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" /><path d="m4 12 8 4.5 8-4.5" /><path d="m4 16.5 8 4.5 8-4.5" /></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-14.8-4L3 10" /><path d="M3 5v5h5" /><path d="M4 13a8.1 8.1 0 0 0 14.8 4L21 14" /><path d="M21 19v-5h-5" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 3-4 3 2 4-6" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L8 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L7.4 8 9.1 6.3l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.2 8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.4h-.2a1.7 1.7 0 0 0-1 1.6Z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1L10.6 5.4" /><path d="M14 11a5 5 0 0 0-7.1-.1L5.5 12.3a5 5 0 0 0 7.1 7.1l.8-.8" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    fire: <path d="M12 22c4.2 0 7-2.6 7-6.5 0-3.8-2.6-6.4-5.4-8.7.1 2-.7 3.5-2.1 4.5.2-3-1.2-5.3-3.1-7.3C8.7 8.3 5 11.2 5 15.5 5 19.4 7.8 22 12 22Z" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">{paths[name]}</svg>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [problems, setProblems] = useState<Problem[]>(getSavedProblems);
  const savedProfile = getSavedProfile();
  const [profileUrl, setProfileUrl] = useState(savedProfile.url);
  const [profileName, setProfileName] = useState(savedProfile.name);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [importedStats, setImportedStats] = useState<ImportedStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      window.setTimeout(() => setAuthUser(nextUser), 0);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const loadCloudWorkspace = async () => {
      try {
        const userSnapshot = await getDoc(doc(db, "users", authUser.uid));
        const cloudProfile = userSnapshot.data();
        if (cloudProfile?.profileUrl) setProfileUrl(cloudProfile.profileUrl as string);
        if (cloudProfile?.leetcodeUsername) setProfileName(cloudProfile.leetcodeUsername as string);
        if (cloudProfile?.stats) setImportedStats(cloudProfile.stats as ImportedStats);
        const problemSnapshot = await getDocs(collection(db, "users", authUser.uid, "problems"));
        if (!problemSnapshot.empty) {
          const cloudProblems = problemSnapshot.docs.map((item) => item.data() as Problem);
          setProblems(cloudProblems);
          window.localStorage.setItem("brainstorm-problems", JSON.stringify(cloudProblems));
        }
      } catch {
        flash("Signed in, but the cloud workspace could not be loaded yet");
      }
    };
    loadCloudWorkspace();
  }, [authUser]);

  const saveProblems = (next: Problem[]) => {
    setProblems(next);
    window.localStorage.setItem("brainstorm-problems", JSON.stringify(next));
  };

  const saveWorkspaceToCloud = async (user: User, username: string, stats: ImportedStats, nextProblems: Problem[]) => {
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      displayName: user.displayName,
      profileUrl,
      leetcodeUsername: username,
      stats,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    for (let index = 0; index < nextProblems.length; index += 450) {
      const chunk = nextProblems.slice(index, index + 450);
      const batch = writeBatch(db);
      chunk.forEach((problem) => batch.set(doc(db, "users", user.uid, "problems", problem.slug), problem, { merge: true }));
      await batch.commit();
    }
  };

  const signIn = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      flash("Google account connected");
    } catch {
      flash("Google sign-in was cancelled or unavailable");
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
    flash("Signed out — local workspace remains available");
  };

  const importProfile = async () => {
    const match = profileUrl.match(/leetcode\.com\/u\/([^/]+)/i) || profileUrl.match(/leetcode\.com\/([^/]+)/i);
    const name = match?.[1] || "your profile";
    setSyncing(true);
    try {
      const response = await fetch(`/api/leetcode/profile?username=${encodeURIComponent(name)}`);
      const payload = await response.json() as { error?: string; username: string; stats: ImportedStats; recentProblems: Array<{ id: string; title: string; slug: string; topics: string[]; difficulty: string; lastSolvedAt: string }> };
      if (!response.ok) throw new Error(payload.error || "LeetCode import failed");
      const existingBySlug = new Map(problems.map((problem) => [problem.slug, problem]));
      const importedProblems: Problem[] = payload.recentProblems.map((item, index) => {
        const existing = existingBySlug.get(item.slug);
        const personalDifficulty = existing?.personalDifficulty || (item.difficulty === "Easy" || item.difficulty === "Hard" ? item.difficulty : "Medium");
        return {
          id: Number(item.id) || index + 1,
          title: item.title,
          slug: item.slug,
          topics: item.topics.length ? item.topics : ["Uncategorized"],
          leetDifficulty: item.difficulty === "Easy" || item.difficulty === "Hard" ? item.difficulty : "Medium",
          personalDifficulty,
          lastSolved: new Date(item.lastSolvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          nextReview: existing?.nextReview || "Today",
          status: existing?.status || (index < 3 ? "Due today" : "Due soon"),
          confidence: existing?.confidence || 50,
          reviewed: existing?.reviewed || false,
        };
      });
      const nextProblems = importedProblems.length ? importedProblems : problems;
      setProfileName(payload.username);
      setImportedStats(payload.stats);
      setSynced(true);
      saveProblems(nextProblems);
      window.localStorage.setItem("brainstorm-profile", JSON.stringify({ url: profileUrl, name: payload.username }));
      if (authUser) {
        await saveWorkspaceToCloud(authUser, payload.username, payload.stats, nextProblems);
        flash(`Imported ${payload.username} and saved it to Firestore`);
      } else {
        flash(`Imported ${payload.username}. Sign in with Google to save it to Firestore.`);
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : "Unable to import this profile");
    } finally {
      setSyncing(false);
    }
  };

  const updateDifficulty = (id: number, personalDifficulty: Difficulty) => {
    const nextProblems = problems.map((problem) => problem.id === id ? { ...problem, personalDifficulty } : problem);
    saveProblems(nextProblems);
    if (authUser) void setDoc(doc(db, "users", authUser.uid, "problems", nextProblems.find((problem) => problem.id === id)?.slug || String(id)), { personalDifficulty }, { merge: true });
    flash("Personal difficulty saved");
  };

  const completeReview = (id: number) => {
    const nextProblems = problems.map((problem) => problem.id === id ? { ...problem, reviewed: true, status: "Scheduled" as const, nextReview: "In 7 days", confidence: Math.min(100, problem.confidence + 8) } : problem);
    saveProblems(nextProblems);
    const reviewed = nextProblems.find((problem) => problem.id === id);
    if (authUser && reviewed) void setDoc(doc(db, "users", authUser.uid, "problems", reviewed.slug), reviewed, { merge: true });
    flash("Review logged — next revision scheduled in 7 days");
  };

  const dueCount = problems.filter((problem) => !problem.reviewed && (problem.status === "Due today" || problem.status === "Due soon")).length;
  const solvedCount = importedStats?.solved || 157;
  const filteredProblems = problems.filter((problem) => problem.title.toLowerCase().includes(search.toLowerCase()) || problem.topics.join(" ").toLowerCase().includes(search.toLowerCase()));

  const nav = [
    { id: "overview" as View, label: "Overview", icon: "grid" },
    { id: "topics" as View, label: "Topic map", icon: "layers" },
    { id: "revision" as View, label: "Revision queue", icon: "refresh", badge: dueCount },
    { id: "progress" as View, label: "Progress", icon: "chart" },
  ];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">B</div><span>brainstorm</span></div>
        <div className="profile-mini"><div className="avatar">P</div><div><strong>{profileName || "your profile"}</strong><span>Personal workspace</span></div><span className="online-dot" /></div>
        <nav className="nav-list" aria-label="Main navigation">
          <span className="nav-label">Workspace</span>
          {nav.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.badge ? <em>{item.badge}</em> : null}</button>)}
          <span className="nav-label second">Manage</span>
          <button className="nav-item" onClick={() => flash("Settings will be available when Firebase is connected")}><Icon name="settings" /><span>Settings</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="mini-progress"><div className="mini-progress-head"><span>Weekly goal</span><strong>12 / 20</strong></div><div className="progress-track"><span style={{ width: "60%" }} /></div><small>8 problems to go</small></div><div className="sidebar-foot"><span>v0.1 · local workspace</span><span className="status-dot" /> <span>Synced</span></div></div>
      </aside>

      <section className="content">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{nav.find((item) => item.id === view)?.label}</strong></div><div className="top-actions"><div className="sync-status"><span className="status-dot" /> {synced ? "Synced just now" : "Demo workspace"}</div><button className="icon-button" aria-label="Search" onClick={() => document.getElementById("problem-search")?.focus()}><Icon name="search" /></button>{authUser ? <button className="account-button" onClick={signOutUser}><span className="top-avatar">{(authUser.displayName || "P").slice(0, 1)}</span><span>{authUser.displayName?.split(" ")[0] || "Account"}</span></button> : <button className="auth-button" onClick={signIn}>Sign in with Google</button>}</div></header>

        <div className="page-wrap">
          <div className="page-heading"><div><p className="eyebrow">THURSDAY, SEPTEMBER 24, 2026</p><h1>{view === "overview" ? <>Good morning, Pranav <span className="wave">✦</span></> : nav.find((item) => item.id === view)?.label}</h1><p className="subheading">{view === "overview" ? "A clear view of where your problem-solving stands." : view === "topics" ? "See your patterns, coverage, and the gaps worth closing." : view === "revision" ? "Small, deliberate reviews turn solved into remembered." : "Measure the work that compounds over time."}</p></div><button className="primary-button" onClick={() => setView("revision")}><Icon name="refresh" /> Review due <span>{dueCount}</span></button></div>

          {view === "overview" && <>
            <section className="connect-card"><div className="connect-copy"><div className="connect-icon"><Icon name="link" /></div><div><strong>Keep your LeetCode progress in sync</strong><p>Drop your public profile link and Brainstorm will organize your solved problems by topic.</p></div></div><div className="connect-form"><input aria-label="LeetCode profile URL" value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} /><button className="secondary-button" onClick={importProfile}>{syncing ? <><span className="spinner" /> Syncing</> : <><Icon name="refresh" /> Sync profile</>}</button></div></section>
            <section className="metric-grid"><Metric label="Problems solved" value={String(solvedCount)} change={importedStats ? `${importedStats.easy} easy · ${importedStats.medium} medium · ${importedStats.hard} hard` : "+14 this month"} icon="check" tone="blue" /><Metric label="Topic mastery" value="68%" change="+6% this month" icon="target" tone="violet" /><Metric label="Due for revision" value={String(dueCount)} change="2 added today" icon="refresh" tone="orange" /><Metric label="Current streak" value={`${importedStats?.streak || 24} days`} change={importedStats ? `${importedStats.totalActiveDays} active days` : "Personal best: 31"} icon="fire" tone="green" /></section>
            <div className="section-row"><div className="section-title"><h2>Topic coverage</h2><span>What you’ve actually practiced</span></div><button className="text-button" onClick={() => setView("topics")}>View topic map <Icon name="arrow" /></button></div>
            <section className="topic-grid">{topicData.slice(0, 4).map((topic) => <TopicCard key={topic.name} {...topic} />)}</section>
            <div className="dashboard-columns"><section className="panel progress-panel"><div className="panel-heading"><div><h2>Practice rhythm</h2><span>Problems solved over the last 12 weeks</span></div><button className="select-button">Last 12 weeks <span>⌄</span></button></div><div className="chart"><div className="chart-y"><span>20</span><span>15</span><span>10</span><span>5</span><span>0</span></div><div className="chart-main"><div className="chart-lines"><i /><i /><i /><i /><i /></div><div className="bars">{[35, 44, 52, 29, 66, 48, 79, 57, 68, 74, 88, 96].map((height, index) => <div className="bar-wrap" key={index}><div className={`bar ${index === 11 ? "current" : ""}`} style={{ height: `${height}%` }} /><span>{["Jul 06", "Jul 13", "Jul 20", "Jul 27", "Aug 03", "Aug 10", "Aug 17", "Aug 24", "Aug 31", "Sep 07", "Sep 14", "Sep 21"][index]}</span></div>)}</div></div></div></section><section className="panel insight-panel"><div className="panel-heading"><div><h2>One useful insight</h2><span>Based on your recent activity</span></div><div className="sparkle">✦</div></div><div className="insight-body"><div className="insight-quote">You’re getting better at recognizing array patterns, but your recall drops after two weeks.</div><div className="insight-line"><div className="insight-icon orange"><Icon name="clock" /></div><div><strong>Try a 15-minute array recall session</strong><span>4 problems are waiting in your revision queue.</span></div></div><button className="full-button" onClick={() => setView("revision")}>Start recall session <Icon name="arrow" /></button></div></section></div>
            <section className="panel recent-panel"><div className="panel-heading"><div><h2>Recent activity</h2><span>Your latest solved problems and reviews</span></div><button className="text-button" onClick={() => setView("progress")}>See all activity <Icon name="arrow" /></button></div><ProblemTable problems={problems.slice(0, 4)} onDifficultyChange={updateDifficulty} onReview={completeReview} compact /></section>
          </>}

          {view === "topics" && <TopicView onBack={() => setView("overview")} />}
          {view === "revision" && <section className="panel revision-view"><div className="panel-heading"><div><h2>Revision queue</h2><span>{dueCount} problems need your attention today.</span></div><div className="queue-filter">All topics <span>⌄</span></div></div><div className="revision-callout"><div className="callout-icon"><Icon name="target" /></div><div><strong>Recall before you reveal</strong><span>Try explaining the approach and complexity before opening your old solution.</span></div><span className="callout-count">{dueCount} due</span></div><ProblemTable problems={filteredProblems} onDifficultyChange={updateDifficulty} onReview={completeReview} /></section>}
          {view === "progress" && <section className="progress-view"><div className="metric-grid"><Metric label="Total solved" value="157" change="Since Sep 2025" icon="check" tone="blue" /><Metric label="Independent solves" value="112" change="71% of total" icon="target" tone="violet" /><Metric label="Recall rate" value="84%" change="+9% this month" icon="refresh" tone="green" /><Metric label="Avg. solve time" value="31m" change="Down 6m this month" icon="clock" tone="orange" /></div><section className="panel progress-detail"><div className="panel-heading"><div><h2>Your progress over time</h2><span>Consistency beats intensity.</span></div></div><div className="big-progress"><div className="big-ring"><span>68<small>%</small></span></div><div className="big-progress-copy"><h3>Topic mastery</h3><p>You’ve built a strong base in arrays and strings. Graphs and dynamic programming are your highest-leverage next steps.</p><div className="legend"><span><i className="blue-dot" /> Strong foundation</span><span><i className="orange-dot" /> Needs attention</span></div></div></div></section><section className="panel recent-panel"><div className="panel-heading"><div><h2>All tracked problems</h2><span>Change the difficulty to match how the problem felt to you.</span></div><div className="search-box"><Icon name="search" /><input id="problem-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search problems or topics" /></div></div><ProblemTable problems={filteredProblems} onDifficultyChange={updateDifficulty} onReview={completeReview} /></section></section>}
        </div>
      </section>
      {toast && <div className="toast"><span className="toast-check"><Icon name="check" /></span>{toast}</div>}
    </main>
  );
}

function Metric({ label, value, change, icon, tone }: { label: string; value: string; change: string; icon: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon name={icon} /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small><b>↗</b> {change}</small></div></div>;
}

function TopicCard({ name, count, total, color, trend }: { name: string; count: number; total: number; color: string; trend: string }) {
  const progress = Math.round((count / total) * 100);
  return <div className="topic-card"><div className="topic-head"><div className={`topic-dot ${color}`} /><strong>{name}</strong><span>{trend}</span></div><div className="topic-count"><strong>{count}</strong><span> / {total} problems</span><b>{progress}%</b></div><div className="progress-track topic-track"><span className={color} style={{ width: `${progress}%` }} /></div></div>;
}

function ProblemTable({ problems, onDifficultyChange, onReview, compact = false }: { problems: Problem[]; onDifficultyChange: (id: number, difficulty: Difficulty) => void; onReview: (id: number) => void; compact?: boolean }) {
  return <div className={`problem-table ${compact ? "compact" : ""}`}><div className="table-row table-header"><span>Problem</span><span>Topics</span><span>Your difficulty</span><span>Last solved</span><span>Next review</span><span /></div>{problems.map((problem) => <div className="table-row" key={problem.id}><div className="problem-name"><div className="problem-number">{String(problem.id).padStart(2, "0")}</div><div><strong>{problem.title}</strong><span>{problem.leetDifficulty} on LeetCode</span></div></div><div className="table-topics">{problem.topics.slice(0, 2).map((topic) => <span key={topic}>{topic}</span>)}</div><select className={`difficulty ${problem.personalDifficulty.toLowerCase()}`} value={problem.personalDifficulty} onChange={(event) => onDifficultyChange(problem.id, event.target.value as Difficulty)} aria-label={`Personal difficulty for ${problem.title}`}><option>Easy</option><option>Medium</option><option>Hard</option></select><span className="muted-cell">{problem.lastSolved}</span><span className={`review-cell ${problem.status === "Due today" ? "due" : ""}`}>{problem.nextReview}</span><div className="row-action">{!problem.reviewed && (problem.status === "Due today" || problem.status === "Due soon") ? <button className="review-button" onClick={() => onReview(problem.id)}>Review</button> : <span className="reviewed"><Icon name="check" /> Reviewed</span>}</div></div>)}{problems.length === 0 && <div className="empty-state">No problems match your search.</div>}</div>;
}

function TopicView({ onBack }: { onBack: () => void }) {
  return <section className="topic-view"><div className="topic-view-head"><div><p className="eyebrow">YOUR KNOWLEDGE MAP</p><h2>Patterns, not just problem counts.</h2><p className="subheading">A topic is becoming a strength when you can recognize it, explain it, and recall it later.</p></div><button className="secondary-button" onClick={onBack}>Back to overview</button></div><div className="topic-grid full">{topicData.map((topic) => <TopicCard key={topic.name} {...topic} />)}</div><div className="dashboard-columns"><section className="panel weakness-panel"><div className="panel-heading"><div><h2>Highest-leverage gaps</h2><span>Where your next hour will compound most.</span></div></div>{[{ name: "Dynamic Programming", value: "27%", text: "8 of 30 practiced", color: "pink" }, { name: "Graphs", value: "34%", text: "12 of 35 practiced", color: "green" }, { name: "Trees", value: "48%", text: "19 of 40 practiced", color: "orange" }].map((item) => <div className="weakness-row" key={item.name}><div className={`topic-dot ${item.color}`} /><div className="weakness-copy"><strong>{item.name}</strong><span>{item.text}</span></div><b>{item.value}</b><button className="small-arrow"><Icon name="arrow" /></button></div>)}</section><section className="panel pattern-panel"><div className="panel-heading"><div><h2>Pattern fluency</h2><span>Your confidence by technique</span></div></div><div className="pattern-list">{[["Sliding window", 84], ["Two pointers", 78], ["Binary search", 65], ["DFS / BFS", 51], ["Dynamic programming", 32]].map(([name, value]) => <div className="pattern-row" key={String(name)}><span>{name}</span><div className="progress-track"><i style={{ width: `${value}%` }} /></div><b>{value}%</b></div>)}</div></section></div></section>;
}
