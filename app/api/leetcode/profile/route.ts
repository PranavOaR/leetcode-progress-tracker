import { NextRequest, NextResponse } from "next/server";

const endpoint = "https://leetcode.com/graphql";

type GraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };

async function queryLeetCode<T>(query: string, variables: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://leetcode.com",
      "Referer": "https://leetcode.com/",
      "User-Agent": "Brainstorm/0.1 (+https://github.com/PranavOaR/leetcode-progress-tracker)",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`LeetCode returned ${response.status}`);
  const payload = await response.json() as GraphQLResponse<T>;
  if (payload.errors?.length || !payload.data) throw new Error(payload.errors?.[0]?.message || "LeetCode returned no data");
  return payload.data;
}

function extractUsername(value: string) {
  const cleaned = value.trim();
  const match = cleaned.match(/leetcode\.com\/u\/([^/?#]+)/i) || cleaned.match(/leetcode\.com\/([^/?#]+)/i);
  return decodeURIComponent(match?.[1] || cleaned.replace(/^@/, ""));
}

const profileQuery = `
  query BrainstormProfile($username: String!, $year: Int) {
    matchedUser(username: $username) {
      username
      profile { realName userAvatar ranking }
      submitStatsGlobal { acSubmissionNum { difficulty count submissions } }
      tagProblemCounts {
        fundamental { tagName tagSlug problemsSolved }
        intermediate { tagName tagSlug problemsSolved }
        advanced { tagName tagSlug problemsSolved }
      }
      userCalendar(year: $year) { streak totalActiveDays submissionCalendar }
    }
  }
`;

const recentQuery = `
  query BrainstormRecent($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id title titleSlug timestamp
    }
  }
`;

const questionQuery = `
  query BrainstormQuestion($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionFrontendId title titleSlug difficulty topicTags { name slug }
    }
  }
`;

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get("username");
  if (!input) return NextResponse.json({ error: "A LeetCode profile URL or username is required." }, { status: 400 });

  const username = extractUsername(input);
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(username)) return NextResponse.json({ error: "That does not look like a valid LeetCode username." }, { status: 400 });

  try {
    const [profile, recent] = await Promise.all([
      queryLeetCode<{ matchedUser: { username: string; profile: { realName: string | null; userAvatar: string | null; ranking: number | null }; submitStatsGlobal: { acSubmissionNum: Array<{ difficulty: string; count: number; submissions?: number }> }; tagProblemCounts: { fundamental: Array<{ tagName: string; tagSlug: string; problemsSolved: number }>; intermediate: Array<{ tagName: string; tagSlug: string; problemsSolved: number }>; advanced: Array<{ tagName: string; tagSlug: string; problemsSolved: number }> }; userCalendar: { streak: number; totalActiveDays: number; submissionCalendar: string } | null } | null }>(profileQuery, { username, year: new Date().getFullYear() }),
      queryLeetCode<{ recentAcSubmissionList: Array<{ id: string; title: string; titleSlug: string; timestamp: string }> }>(recentQuery, { username, limit: 25 }),
    ]);

    if (!profile.matchedUser) return NextResponse.json({ error: `No public LeetCode profile was found for ${username}.` }, { status: 404 });

    const uniqueSubmissions = Array.from(new Map((recent.recentAcSubmissionList || []).map((submission) => [submission.titleSlug, submission])).values());
    const recentProblems = await Promise.all(uniqueSubmissions.map(async (submission) => {
      try {
        const detail = await queryLeetCode<{ question: { questionFrontendId: string; title: string; titleSlug: string; difficulty: string; topicTags: Array<{ name: string; slug: string }> } | null }>(questionQuery, { titleSlug: submission.titleSlug });
        return { ...submission, question: detail.question };
      } catch {
        return { ...submission, question: null };
      }
    }));

    const accepted = profile.matchedUser.submitStatsGlobal.acSubmissionNum;
    const topicStats = [
      ...profile.matchedUser.tagProblemCounts.fundamental,
      ...profile.matchedUser.tagProblemCounts.intermediate,
      ...profile.matchedUser.tagProblemCounts.advanced,
    ].map((topic) => ({ name: topic.tagName, slug: topic.tagSlug, solved: topic.problemsSolved }));
    return NextResponse.json({
      username: profile.matchedUser.username,
      profile: profile.matchedUser.profile,
      stats: {
        solved: accepted.find((item) => item.difficulty === "All")?.count || 0,
        easy: accepted.find((item) => item.difficulty === "Easy")?.count || 0,
        medium: accepted.find((item) => item.difficulty === "Medium")?.count || 0,
        hard: accepted.find((item) => item.difficulty === "Hard")?.count || 0,
        streak: profile.matchedUser.userCalendar?.streak || 0,
        totalActiveDays: profile.matchedUser.userCalendar?.totalActiveDays || 0,
        submissionCalendar: profile.matchedUser.userCalendar?.submissionCalendar || "{}",
        topicStats,
      },
      recentProblems: recentProblems.map((item) => ({
        id: item.question?.questionFrontendId || item.id,
        title: item.question?.title || item.title,
        slug: item.question?.titleSlug || item.titleSlug,
        topics: item.question?.topicTags?.map((tag) => tag.name) || [],
        difficulty: item.question?.difficulty || "Unknown",
        lastSolvedAt: new Date(Number(item.timestamp) * 1000).toISOString(),
      })),
      limitations: ["LeetCode's public profile endpoints expose aggregate stats and recent accepted submissions. A full historical solved-problem list requires an authenticated LeetCode session or an import file.", "Brainstorm keeps all personal difficulty, notes, and revision data in Firestore."]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach LeetCode right now.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
