"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, deleteUser, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type Difficulty = "Easy" | "Medium" | "Hard";
type View = "overview" | "topics" | "revision" | "progress" | "settings";

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
  topicStats: Array<{ name: string; slug: string; solved: number }>;
};

const topicColors = ["blue", "violet", "orange", "green", "pink", "cyan"];

function deriveTopicData(problems: Problem[], imported: boolean, topicStats: ImportedStats["topicStats"] = []) {
  if (topicStats.length) {
    const maxSolved = Math.max(...topicStats.map((topic) => topic.solved), 1);
    return topicStats.slice().sort((a, b) => b.solved - a.solved).map((topic, index) => ({
      name: topic.name,
      count: topic.solved,
      total: 0,
      color: topicColors[index % topicColors.length],
      trend: `${topic.solved} solved`,
      label: "solved",
      percentage: Math.round((topic.solved / maxSolved) * 100),
      percentageLabel: "relative",
    }));
  }
  if (!problems.length) return [];
  const counts = new Map<string, number>();
  problems.forEach((problem) => problem.topics.forEach((topic) => counts.set(topic, (counts.get(topic) || 0) + 1)));
  const total = problems.length;
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([name, count], index) => ({
    name,
    count,
    total,
    color: topicColors[index % topicColors.length],
    trend: imported ? `${Math.round((count / total) * 100)}% share` : `+${Math.max(2, index + 4)}%`,
    label: imported ? "tracked" : "problems",
    percentage: Math.round((count / total) * 100),
  }));
}

function getActivityBars(calendar: string | undefined) {
  const fallback = Array.from({ length: 12 }, (_, index) => ({ height: 4, label: `Week ${index + 1}`, value: 0 }));
  if (!calendar) return fallback;
  try {
    const daily = Object.entries(JSON.parse(calendar) as Record<string, number>);
    const now = Date.now();
    const weeks = Array.from({ length: 12 }, (_, index) => {
      const end = now - (11 - index) * 7 * 24 * 60 * 60 * 1000;
      const start = end - 7 * 24 * 60 * 60 * 1000;
      const value = daily.reduce((sum, [timestamp, count]) => {
        const time = Number(timestamp) * 1000;
        return time >= start && time < end ? sum + Number(count) : sum;
      }, 0);
      return { value, label: new Date(start).toLocaleDateString("en-US", { month: "short", day: "2-digit" }) };
    });
    const max = Math.max(...weeks.map((week) => week.value), 1);
    return weeks.map((week) => ({ ...week, height: week.value ? Math.max(10, Math.round((week.value / max) * 100)) : 4 }));
  } catch {
    return fallback;
  }
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
  const [problems, setProblems] = useState<Problem[]>([]);
  const [profileUrl, setProfileUrl] = useState("");
  const [profileName, setProfileName] = useState("your profile");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [importedStats, setImportedStats] = useState<ImportedStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [connectError, setConnectError] = useState("");
  const [revisionTopic, setRevisionTopic] = useState("All topics");
  const [topicFocus, setTopicFocus] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    window.setTimeout(() => {
      const savedProblems = window.localStorage.getItem("brainstorm-problems");
      const savedProfile = window.localStorage.getItem("brainstorm-profile");
      const savedStats = window.localStorage.getItem("brainstorm-stats");
      const savedTheme = window.localStorage.getItem("brainstorm-theme");
      if (savedStats && savedProblems) setProblems(JSON.parse(savedProblems) as Problem[]);
      if (!savedStats) window.localStorage.removeItem("brainstorm-problems");
      if (savedStats && savedProfile) {
        const profile = JSON.parse(savedProfile) as { url: string; name: string };
        setProfileUrl(profile.url);
        setProfileName(profile.name);
      }
      if (!savedStats) {
        window.localStorage.removeItem("brainstorm-profile");
        setProfileUrl("");
      }
      if (savedStats) setImportedStats(JSON.parse(savedStats) as ImportedStats);
      if (savedTheme === "dark") setDarkMode(true);
    }, 0);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      window.setTimeout(() => {
        setAuthUser(nextUser);
        setAuthReady(true);
        if (!nextUser) {
          setAccountReady(true);
          setConnectedUsername(null);
        } else {
          setAccountReady(false);
        }
      }, 0);
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
        if (cloudProfile?.leetcodeUsername) {
          setProfileName(cloudProfile.leetcodeUsername as string);
          setConnectedUsername(cloudProfile.leetcodeUsername as string);
        }
        if (cloudProfile?.stats) {
          setImportedStats(cloudProfile.stats as ImportedStats);
          window.localStorage.setItem("brainstorm-stats", JSON.stringify(cloudProfile.stats));
        }
        setSynced(Boolean(cloudProfile));
        const problemSnapshot = await getDocs(collection(db, "users", authUser.uid, "problems"));
        if (!problemSnapshot.empty) {
          const cloudProblems = problemSnapshot.docs.map((item) => item.data() as Problem);
          setProblems(cloudProblems);
          window.localStorage.setItem("brainstorm-problems", JSON.stringify(cloudProblems));
        }
        setAccountReady(true);
      } catch {
        flash("Signed in, but the cloud workspace could not be loaded yet");
        setAccountReady(true);
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

  const deleteBrainstormAccount = async () => {
    if (!authUser || !window.confirm("Delete your Brainstorm account and all saved progress? This cannot be undone.")) return;
    try {
      const problemSnapshot = await getDocs(collection(db, "users", authUser.uid, "problems"));
      for (let index = 0; index < problemSnapshot.docs.length; index += 450) {
        const batch = writeBatch(db);
        problemSnapshot.docs.slice(index, index + 450).forEach((problem) => batch.delete(problem.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, "users", authUser.uid));
      await deleteUser(authUser);
      window.localStorage.removeItem("brainstorm-problems");
      window.localStorage.removeItem("brainstorm-profile");
      window.localStorage.removeItem("brainstorm-stats");
      setProblems([]);
      setImportedStats(null);
      setConnectedUsername(null);
      flash("Your Brainstorm account was deleted");
    } catch {
      flash("Account deletion needs a recent Google sign-in. Sign in again and retry.");
    }
  };

  const importProfile = async () => {
    setConnectError("");
    const rawProfile = profileUrl.trim();
    const match = rawProfile.match(/leetcode\.com\/u\/([^/?#]+)/i) || rawProfile.match(/leetcode\.com\/([^/?#]+)/i);
    const name = connectedUsername || match?.[1] || rawProfile.replace(/^@/, "");
    if (!name || !/^[a-zA-Z0-9_-]{1,40}$/.test(name)) {
      setConnectError("Enter a valid public LeetCode profile URL.");
      return;
    }
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
      window.localStorage.setItem("brainstorm-stats", JSON.stringify(payload.stats));
      setSynced(true);
      saveProblems(nextProblems);
      window.localStorage.setItem("brainstorm-profile", JSON.stringify({ url: profileUrl, name: payload.username }));
      if (authUser) {
        await saveWorkspaceToCloud(authUser, payload.username, payload.stats, nextProblems);
        setConnectedUsername(payload.username);
        flash(`Imported ${payload.username} and saved it to Firestore`);
      } else {
        flash(`Imported ${payload.username}. Sign in with Google to save it to Firestore.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import this profile";
      const friendlyMessage = message.toLowerCase().includes("permission")
        ? "LeetCode was reached, but Firestore rejected the save. Publish the firestore.rules file to your Firebase project, then try again."
        : message;
      setConnectError(friendlyMessage);
      flash(friendlyMessage);
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
  const solvedCount = importedStats?.solved ?? 0;
  const isImported = Boolean(importedStats);
  const dynamicTopics = isImported ? deriveTopicData(problems, true, importedStats?.topicStats || []) : [];
  const activityBars = getActivityBars(importedStats?.submissionCalendar);
  const topicNames = Array.from(new Set(problems.flatMap((problem) => problem.topics))).sort();
  const filteredProblems = problems.filter((problem) => problem.title.toLowerCase().includes(search.toLowerCase()) || problem.topics.join(" ").toLowerCase().includes(search.toLowerCase()));
  const revisionProblems = revisionTopic === "All topics" ? filteredProblems : filteredProblems.filter((problem) => problem.topics.includes(revisionTopic));
  const trackedMastery = problems.length ? Math.round(problems.reduce((sum, problem) => sum + problem.confidence, 0) / problems.length) : 0;
  const topicMastery = isImported
    ? problems.length ? `${trackedMastery}%` : `${importedStats?.topicStats?.length || 0}`
    : "—";

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    window.localStorage.setItem("brainstorm-theme", next ? "dark" : "light");
  };
  const nav = [
    { id: "overview" as View, label: "Overview", icon: "grid" },
    { id: "topics" as View, label: "Topic map", icon: "layers" },
    { id: "revision" as View, label: "Revision queue", icon: "refresh", badge: dueCount },
    { id: "progress" as View, label: "Progress", icon: "chart" },
  ];

  if (!authReady || (authUser && !accountReady)) return <AuthLoading darkMode={darkMode} onToggleTheme={toggleDarkMode} />;
  if (!authUser) return <AuthGate darkMode={darkMode} onToggleTheme={toggleDarkMode} onSignIn={signIn} />;
  if (!connectedUsername) return <ProfileConnectGate darkMode={darkMode} onToggleTheme={toggleDarkMode} user={authUser} profileUrl={profileUrl} setProfileUrl={(value) => { setConnectError(""); setProfileUrl(value); }} syncing={syncing} error={connectError} onConnect={importProfile} onSignOut={signOutUser} />;

  return (
    <main className={`shell ${darkMode ? "dark" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><span>brainstorm</span></div>
        <div className="profile-mini"><div className="avatar">P</div><div><strong>{profileName || "your profile"}</strong><span>Personal workspace</span></div><span className="online-dot" /></div>
        <nav className="nav-list" aria-label="Main navigation">
          <span className="nav-label">Workspace</span>
          {nav.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.badge ? <em>{item.badge}</em> : null}</button>)}
          <span className="nav-label second">Manage</span>
          <button className={`nav-item ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")}><Icon name="settings" /><span>Settings</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="mini-progress"><div className="mini-progress-head"><span>Weekly goal</span><strong>12 / 20</strong></div><div className="progress-track"><span style={{ width: "60%" }} /></div><small>8 problems to go</small></div><div className="sidebar-foot"><span>Private workspace</span><span className="status-dot" /> <span>Secure</span></div></div>
      </aside>

      <section className="content">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{view === "settings" ? "Settings" : nav.find((item) => item.id === view)?.label}</strong></div><div className="top-actions"><div className="sync-status"><span className="status-dot" /> {synced ? "Synced just now" : "Not synced"}</div><button className="icon-button" aria-label="Search" onClick={() => document.getElementById("problem-search")?.focus()}><Icon name="search" /></button><button className="theme-button" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleDarkMode}>{darkMode ? "☼" : "☾"}</button><button className="account-button" onClick={signOutUser}><span className="top-avatar">{(authUser.displayName || "P").slice(0, 1)}</span><span>{authUser.displayName?.split(" ")[0] || "Account"}</span></button></div></header>

        <div className="page-wrap">
          <div className="page-heading"><div><p className="eyebrow">THURSDAY, SEPTEMBER 24, 2026</p><h1>{view === "overview" ? <>Good morning, {authUser.displayName?.split(" ")[0] || "there"} <span className="wave">✦</span></> : view === "settings" ? "Settings" : nav.find((item) => item.id === view)?.label}</h1><p className="subheading">{view === "overview" ? "A clear view of where your problem-solving stands." : view === "topics" ? "See your patterns, coverage, and the gaps worth closing." : view === "revision" ? "Small, deliberate reviews turn solved into remembered." : view === "progress" ? "Measure the work that compounds over time." : "Manage your Brainstorm account and connected profile."}</p></div>{view !== "settings" && <button className="primary-button" onClick={() => setView("revision")}><Icon name="refresh" /> Review due <span>{dueCount}</span></button>}</div>

          {view === "overview" && <>
            <section className="connect-card"><div className="connect-copy"><div className="connect-icon"><Icon name="link" /></div><div><strong>LeetCode profile connected</strong><p>Your profile is locked to this Brainstorm account. Refresh it whenever you want updated stats.</p></div></div><div className="connect-form"><div className="connected-profile"><span>Connected profile</span><strong>leetcode.com/u/{connectedUsername}</strong><small>Profile connection is locked</small></div><button className="secondary-button" onClick={importProfile}>{syncing ? <><span className="spinner" /> Syncing</> : <><Icon name="refresh" /> Refresh profile</>}</button></div></section>
            <section className="metric-grid"><Metric label="Problems solved" value={String(solvedCount)} change={importedStats ? `${importedStats.easy} easy · ${importedStats.medium} medium · ${importedStats.hard} hard` : "Sync to load your data"} icon="check" tone="blue" /><Metric label="Topic mastery" value={topicMastery} change={isImported ? problems.length ? "Average confidence" : "LeetCode topics mapped" : "Waiting for sync"} icon="target" tone="violet" /><Metric label="Due for revision" value={String(dueCount)} change={isImported ? "From your tracked queue" : "Waiting for first review"} icon="refresh" tone="orange" /><Metric label="Current streak" value={`${importedStats?.streak || 0} days`} change={importedStats ? `${importedStats.totalActiveDays} active days` : "Sync to load your streak"} icon="fire" tone="green" /></section>
            <div className="section-row"><div className="section-title"><h2>Topic coverage</h2><span>What you’ve actually practiced</span></div><button className="text-button" onClick={() => setView("topics")}>View topic map <Icon name="arrow" /></button></div>
            <section className="topic-grid">{dynamicTopics.length ? dynamicTopics.slice(0, 4).map((topic) => <TopicCard key={topic.name} {...topic} onClick={() => { setTopicFocus(topic.name); setView("topics"); }} />) : <div className="empty-data-card"><strong>No topic data yet</strong><span>Sync your public LeetCode profile to build a user-specific topic map.</span></div>}</section>
            <div className="dashboard-columns"><section className="panel progress-panel"><div className="panel-heading"><div><h2>Practice rhythm</h2><span>{isImported ? "Your LeetCode activity over the last 12 weeks" : "Sync a profile to see your activity"}</span></div><button className="select-button">Last 12 weeks <span>⌄</span></button></div><div className="chart"><div className="chart-y"><span>{Math.max(...activityBars.map((bar) => bar.value), 0)}</span><span>{Math.ceil(Math.max(...activityBars.map((bar) => bar.value), 0) * .75)}</span><span>{Math.ceil(Math.max(...activityBars.map((bar) => bar.value), 0) * .5)}</span><span>{Math.ceil(Math.max(...activityBars.map((bar) => bar.value), 0) * .25)}</span><span>0</span></div><div className="chart-main"><div className="chart-lines"><i /><i /><i /><i /><i /></div><div className="bars">{activityBars.map((bar, index) => <div className="bar-wrap" key={bar.label}><div className={`bar ${index === activityBars.length - 1 ? "current" : ""}`} style={{ height: `${bar.height}%` }} /><span>{bar.label}</span></div>)}</div></div></div></section><section className="panel insight-panel"><div className="panel-heading"><div><h2>One useful insight</h2><span>{isImported ? "Based on your tracked problems" : "Waiting for your profile"}</span></div><div className="sparkle">✦</div></div><div className="insight-body"><div className="insight-quote">{isImported ? (dynamicTopics[0] ? `${dynamicTopics[0].name} is your most represented topic right now.` : "Your synced profile is ready for analysis.") : "Sync your public profile to turn activity into a personal learning signal."}</div><div className="insight-line"><div className="insight-icon orange"><Icon name="clock" /></div><div><strong>{isImported ? `${dueCount} problems are waiting for review` : "Connect your profile first"}</strong><span>{isImported ? "Keep the queue small and review consistently." : "Your account will begin tracking here."}</span></div></div><button className="full-button" onClick={() => setView(isImported ? "revision" : "overview")}>{isImported ? "Start recall session" : "Refresh profile"} <Icon name="arrow" /></button></div></section></div>
            <section className="panel recent-panel"><div className="panel-heading"><div><h2>Recent activity</h2><span>Your latest solved problems and reviews</span></div><button className="text-button" onClick={() => setView("progress")}>See all activity <Icon name="arrow" /></button></div><ProblemTable problems={problems.slice(0, 4)} onDifficultyChange={updateDifficulty} onReview={completeReview} compact emptyMessage="No recent accepted problem titles were returned. Your profile totals and topic counts are still synced." /></section>
          </>}

          {view === "topics" && <TopicView topics={dynamicTopics} problems={problems} focusedTopic={topicFocus} onFocus={setTopicFocus} onBack={() => setView("overview")} onDifficultyChange={updateDifficulty} onReview={completeReview} />}
          {view === "revision" && <section className="panel revision-view"><div className="panel-heading"><div><h2>Revision queue</h2><span>{dueCount} problems need your attention today.</span></div><select className="queue-filter" value={revisionTopic} onChange={(event) => setRevisionTopic(event.target.value)}><option>All topics</option>{topicNames.map((topic) => <option key={topic}>{topic}</option>)}</select></div><div className="revision-callout"><div className="callout-icon"><Icon name="target" /></div><div><strong>Recall before you reveal</strong><span>Try explaining the approach and complexity before opening your old solution.</span></div><span className="callout-count">{revisionProblems.length} shown</span></div><ProblemTable problems={revisionProblems} onDifficultyChange={updateDifficulty} onReview={completeReview} emptyMessage="No recent accepted problem titles are available for revision yet. Solve a problem on LeetCode, then refresh your profile." /></section>}
          {view === "progress" && <section className="progress-view"><div className="metric-grid"><Metric label="Total solved" value={String(solvedCount)} change={isImported ? "From your LeetCode profile" : "Sync to load your profile"} icon="check" tone="blue" /><Metric label="Tracked problems" value={String(problems.length)} change={isImported ? "Recent accepted submissions" : "Waiting for profile data"} icon="target" tone="violet" /><Metric label="Recall rate" value={isImported ? `${trackedMastery}%` : "—"} change={isImported ? "Average confidence" : "Review a problem to start"} icon="refresh" tone="green" /><Metric label="Active days" value={String(importedStats?.totalActiveDays || 0)} change={isImported ? "From your LeetCode calendar" : "Sync to load your calendar"} icon="clock" tone="orange" /></div><section className="panel progress-detail"><div className="panel-heading"><div><h2>Your progress over time</h2><span>{isImported ? "Derived from your synced LeetCode calendar and tracked reviews." : "Connect your profile to replace this with your own data."}</span></div></div><div className="big-progress"><div className="big-ring" style={{ background: `conic-gradient(var(--blue) 0 ${isImported ? trackedMastery : 0}%, #e9eef6 ${isImported ? trackedMastery : 0}% 100%)` }}><span>{isImported ? trackedMastery : 0}<small>%</small></span></div><div className="big-progress-copy"><h3>{isImported ? "Tracked recall mastery" : "No personal progress yet"}</h3><p>{isImported ? `This score is the average confidence across ${problems.length} tracked problems. Update confidence through revisions to make it more meaningful over time.` : "Sync your public LeetCode profile, then use the revision queue to build a personal progress history."}</p><div className="legend"><span><i className="blue-dot" /> Personal data</span><span><i className="orange-dot" /> Revision confidence</span></div></div></div></section><section className="panel recent-panel"><div className="panel-heading"><div><h2>All tracked problems</h2><span>Change the difficulty to match how the problem felt to you.</span></div><div className="search-box"><Icon name="search" /><input id="problem-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search problems or topics" /></div></div><ProblemTable problems={filteredProblems} onDifficultyChange={updateDifficulty} onReview={completeReview} emptyMessage="No tracked problem titles are available yet. Recent accepted submissions will appear here after your next profile refresh." /></section></section>}
          {view === "settings" && <SettingsView user={authUser} connectedUsername={connectedUsername} onDeleteAccount={deleteBrainstormAccount} />}
        </div>
      </section>
      {toast && <div className="toast"><span className="toast-check"><Icon name="check" /></span>{toast}</div>}
    </main>
  );
}

function Metric({ label, value, change, icon, tone }: { label: string; value: string; change: string; icon: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon name={icon} /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small><b>↗</b> {change}</small></div></div>;
}

function AuthLoading({ darkMode, onToggleTheme }: { darkMode: boolean; onToggleTheme: () => void }) {
  return <main className={`auth-shell ${darkMode ? "dark" : ""}`}><button className="theme-button auth-theme" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={onToggleTheme}>{darkMode ? "☼" : "☾"}</button><div className="auth-card loading-card"><div className="auth-brand">brainstorm</div><div className="auth-spinner" /><p>Preparing your private workspace…</p></div></main>;
}

function AuthGate({ darkMode, onToggleTheme, onSignIn }: { darkMode: boolean; onToggleTheme: () => void; onSignIn: () => void }) {
  return <main className={`auth-shell ${darkMode ? "dark" : ""}`}><button className="theme-button auth-theme" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={onToggleTheme}>{darkMode ? "☼" : "☾"}</button><div className="auth-card"><div className="auth-brand">brainstorm</div><p className="eyebrow">YOUR PROBLEM-SOLVING OS</p><h1>Make every solved problem count.</h1><p className="auth-copy">Organize your LeetCode progress by topic, remember what you solved, and build a revision habit that compounds.</p><button className="google-button" onClick={onSignIn}><span className="google-g">G</span> Continue with Google <Icon name="arrow" /></button><small>Brainstorm uses Google only for account access. Your LeetCode profile is connected separately after sign-in.</small></div></main>;
}

function ProfileConnectGate({ darkMode, onToggleTheme, user, profileUrl, setProfileUrl, syncing, error, onConnect, onSignOut }: { darkMode: boolean; onToggleTheme: () => void; user: User; profileUrl: string; setProfileUrl: (value: string) => void; syncing: boolean; error: string; onConnect: () => void; onSignOut: () => void }) {
  return <main className={`auth-shell ${darkMode ? "dark" : ""}`}><button className="theme-button auth-theme" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={onToggleTheme}>{darkMode ? "☼" : "☾"}</button><div className="auth-card profile-card"><div className="auth-brand">brainstorm</div><p className="eyebrow">ONE-TIME CONNECTION</p><h1>Connect your LeetCode profile.</h1><p className="auth-copy">Welcome, {user.displayName?.split(" ")[0] || "there"}. Enter your public profile URL once. Brainstorm will lock it to this account and keep your stats refreshable.</p><label htmlFor="first-profile-url">LeetCode profile URL</label><input id="first-profile-url" value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} placeholder="Paste your public LeetCode profile URL" autoComplete="off" />{error && <div className="form-error" role="alert">{error}</div>}<button className="google-button connect-first-button" onClick={onConnect} disabled={syncing}>{syncing ? <><span className="spinner" /> Connecting…</> : <>Connect profile <Icon name="arrow" /></>}</button><p className="lock-note">After connection, this profile cannot be unsynced. You can refresh its data or delete your Brainstorm account from Settings.</p><button className="plain-button" onClick={onSignOut}>Use a different Google account</button></div></main>;
}

function SettingsView({ user, connectedUsername, onDeleteAccount }: { user: User; connectedUsername: string | null; onDeleteAccount: () => void }) {
  return <section className="settings-view"><section className="panel settings-card"><div className="settings-header"><div><p className="eyebrow">ACCOUNT</p><h2>Settings</h2><p className="subheading">Your Brainstorm account and connection details.</p></div></div><div className="settings-row"><div><span className="settings-label">Google account</span><strong>{user.email || user.displayName || "Connected account"}</strong></div><span className="settings-pill">Connected</span></div><div className="settings-row"><div><span className="settings-label">LeetCode profile</span><strong>leetcode.com/u/{connectedUsername}</strong><small>Locked after the first connection. Refresh from Overview.</small></div><span className="settings-pill">Locked</span></div></section><section className="panel danger-card"><p className="eyebrow">DANGER ZONE</p><h2>Delete Brainstorm account</h2><p>This permanently deletes your Brainstorm profile, imported problems, revision history, notes, and settings. Your LeetCode account is not affected.</p><button className="delete-button" onClick={onDeleteAccount}>Delete my Brainstorm account</button></section></section>;
}

function TopicCard({ name, count, total, color, trend, label = "problems", percentage, percentageLabel, onClick }: { name: string; count: number; total: number; color: string; trend: string; label?: string; percentage?: number; percentageLabel?: string; onClick?: () => void }) {
  const progress = percentage ?? Math.round((count / total) * 100);
  return <button className={`topic-card ${onClick ? "clickable" : ""}`} onClick={onClick}><div className="topic-head"><div className={`topic-dot ${color}`} /><strong>{name}</strong><span>{trend}</span></div><div className="topic-count"><strong>{count}</strong><span>{label === "solved" ? " solved" : ` / ${total} ${label}`}</span><b>{percentageLabel || `${progress}%`}</b></div><div className="progress-track topic-track"><span className={color} style={{ width: `${progress}%` }} /></div></button>;
}

function ProblemTable({ problems, onDifficultyChange, onReview, compact = false, emptyMessage = "No problems match your search." }: { problems: Problem[]; onDifficultyChange: (id: number, difficulty: Difficulty) => void; onReview: (id: number) => void; compact?: boolean; emptyMessage?: string }) {
  return <div className={`problem-table ${compact ? "compact" : ""}`}><div className="table-row table-header"><span>Problem</span><span>Topics</span><span>Your difficulty</span><span>Last solved</span><span>Next review</span><span /></div>{problems.map((problem) => <div className="table-row" key={problem.id}><div className="problem-name"><div className="problem-number">{String(problem.id).padStart(2, "0")}</div><div><strong>{problem.title}</strong><span>{problem.leetDifficulty} on LeetCode</span></div></div><div className="table-topics">{problem.topics.slice(0, 2).map((topic) => <span key={topic}>{topic}</span>)}</div><select className={`difficulty ${problem.personalDifficulty.toLowerCase()}`} value={problem.personalDifficulty} onChange={(event) => onDifficultyChange(problem.id, event.target.value as Difficulty)} aria-label={`Personal difficulty for ${problem.title}`}><option>Easy</option><option>Medium</option><option>Hard</option></select><span className="muted-cell">{problem.lastSolved}</span><span className={`review-cell ${problem.status === "Due today" ? "due" : ""}`}>{problem.nextReview}</span><div className="row-action">{!problem.reviewed && (problem.status === "Due today" || problem.status === "Due soon") ? <button className="review-button" onClick={() => onReview(problem.id)}>Review</button> : <span className="reviewed"><Icon name="check" /> Reviewed</span>}</div></div>)}{problems.length === 0 && <div className="empty-state">{emptyMessage}</div>}</div>;
}

function TopicView({ topics, problems, focusedTopic, onFocus, onBack, onDifficultyChange, onReview }: { topics: Array<{ name: string; count: number; total: number; color: string; trend: string; label?: string; percentage?: number; percentageLabel?: string }>; problems: Problem[]; focusedTopic: string | null; onFocus: (topic: string | null) => void; onBack: () => void; onDifficultyChange: (id: number, difficulty: Difficulty) => void; onReview: (id: number) => void }) {
  const gaps = topics.slice().sort((a, b) => ((a.percentage ?? (a.count / a.total) * 100) - (b.percentage ?? (b.count / b.total) * 100))).slice(0, 3);
  const selectedProblems = focusedTopic ? problems.filter((problem) => problem.topics.includes(focusedTopic)) : [];
  const gapPercentage = (topic: typeof topics[number]) => Math.round(topic.percentage ?? (topic.count / topic.total) * 100);
  return <section className="topic-view"><div className="topic-view-head"><div><p className="eyebrow">YOUR KNOWLEDGE MAP</p><h2>Patterns, not just problem counts.</h2><p className="subheading">A topic is becoming a strength when you can recognize it, explain it, and recall it later.</p></div><button className="secondary-button" onClick={onBack}>Back to overview</button></div>{topics.length ? <><div className="topic-grid full">{topics.map((topic) => <TopicCard key={topic.name} {...topic} onClick={() => onFocus(topic.name)} />)}</div><div className="dashboard-columns"><section className="panel weakness-panel"><div className="panel-heading"><div><h2>Topics to strengthen</h2><span>Lower-volume topics are surfaced first. Click one to inspect available recent solves.</span></div></div>{gaps.map((item) => <button className="weakness-row" key={item.name} onClick={() => onFocus(item.name)}><div className={`topic-dot ${item.color}`} /><div className="weakness-copy"><strong>{item.name}</strong><span>{item.count} solved on LeetCode · {item.percentageLabel || `${gapPercentage(item)}% relative volume`}</span></div><b>{item.percentageLabel || `${gapPercentage(item)}%`}</b><span className="small-arrow"><Icon name="arrow" /></span></button>)}</section><section className="panel pattern-panel"><div className="panel-heading"><div><h2>Topic volume</h2><span>Relative distribution of your solved problems by topic</span></div></div><div className="pattern-list">{topics.slice(0, 5).map((topic) => <div className="pattern-row" key={topic.name}><span>{topic.name}</span><div className="progress-track"><i style={{ width: `${gapPercentage(topic)}%` }} /></div><b>{topic.count}</b></div>)}</div></section></div>{focusedTopic && <section className="panel topic-problems"><div className="panel-heading"><div><h2>{focusedTopic}</h2><span>{selectedProblems.length ? `${selectedProblems.length} recent accepted solves shown` : "No recent accepted problem titles were returned for this topic"}</span></div><button className="text-button" onClick={() => onFocus(null)}>Clear selection</button></div>{selectedProblems.length ? <ProblemTable problems={selectedProblems} onDifficultyChange={onDifficultyChange} onReview={onReview} /> : <div className="empty-state">LeetCode exposes full topic totals publicly, but its public profile API only exposes a limited recent accepted-submission list. Refresh after solving a new problem, or add older solved problems manually to track them for revision.</div>}</section>}</> : <div className="empty-data-card topic-empty"><strong>Sync a profile to build your knowledge map</strong><span>The topic cards and leverage gaps will be generated from your own imported problems.</span></div>}</section>;
}
