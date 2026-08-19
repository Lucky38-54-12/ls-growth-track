import Anthropic from "@anthropic-ai/sdk";

// Lets the Brain chat propose real changes to this app's own codebase as a
// GitHub pull request — Lucky reviews and merges from GitHub (or the PR
// link dropped back into chat), same "propose, human merges" shape as
// every other Brain action, just via GitHub's own review UI instead of the
// chat_drafts approve/reject queue. Runs entirely against GitHub's REST API
// (no local clone) since the dashboard runs on Vercel, which has no
// persistent filesystem to hold a checked-out repo between requests.

const GITHUB_API = "https://api.github.com";
const OWNER = "Lucky38-54-12";
const REPO = "ls-growth-track";
const BASE_BRANCH = "main";
const MAX_TOOL_TURNS = 14;

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN env var is not set");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function gh(path: string, init?: RequestInit) {
  const res = await fetch(`${GITHUB_API}${path}`, { ...init, headers: { ...ghHeaders(), ...(init?.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${init?.method || "GET"} ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

// Full file tree on the base branch, filtered to real source files — given
// to the model up front so it can find what to read without a blind
// "list directory" round trip per folder.
async function listRepoFiles(): Promise<string[]> {
  const ref = await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BASE_BRANCH}`);
  const commitSha = ref.object.sha;
  const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${commitSha}`);
  const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
  const SKIP = /^(node_modules|\.next|\.git)\//;
  const KEEP_EXT = /\.(ts|tsx|js|jsx|sql|md|json|css)$/;
  return (tree.tree as { path: string; type: string }[])
    .filter((n) => n.type === "blob" && !SKIP.test(n.path) && KEEP_EXT.test(n.path))
    .map((n) => n.path);
}

async function getBaseBranchSha(): Promise<string> {
  const ref = await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BASE_BRANCH}`);
  return ref.object.sha;
}

async function createBranch(branchName: string, fromSha: string): Promise<void> {
  await gh(`/repos/${OWNER}/${REPO}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
  });
}

async function readFileOnBranch(path: string, branch: string): Promise<{ content: string; sha: string } | null> {
  try {
    const data = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);
    if (Array.isArray(data)) throw new Error(`"${path}" is a directory, not a file`);
    return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) return null;
    throw e;
  }
}

async function writeFileOnBranch(path: string, content: string, branch: string, message: string): Promise<void> {
  const existing = await readFileOnBranch(path, branch);
  await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch,
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read a file's full current content from the working branch.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Repo-relative path, e.g. app/dashboard/today/page.tsx" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write a file's full new content, committing it directly to the working branch. Always pass the COMPLETE file content, not a diff/patch.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string", description: "The complete new file content." },
        commit_message: { type: "string", description: "Short commit message for this specific file change." },
      },
      required: ["path", "content", "commit_message"],
    },
  },
  {
    name: "finish",
    description: "Call this once all necessary file changes have been made, with a short summary of what changed and why.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
  },
];

const SYSTEM_PROMPT = `You are making a real, scoped code change to the LS Growth outreach dashboard (Next.js app, no Tailwind — inline styles) directly on a fresh git branch, via the read_file/write_file tools. There is no way to run a build, typecheck, or tests here, so be precise and conservative:

- Only touch files actually relevant to the request. Don't refactor, rename, or "clean up" anything unrelated.
- Always read a file with read_file before writing it, so your write_file call contains the complete correct content, not a guess.
- Match the existing code style exactly (inline style objects, existing naming conventions, existing patterns in nearby files) rather than introducing a new pattern.
- Keep changes minimal and directly targeted at what was asked.
- When genuinely done, call finish with a short plain-English summary of what you changed and why — this becomes the pull request description.
- If the request is too vague to act on safely (e.g. you can't tell which file/page it means), call finish anyway and explain in the summary what's unclear rather than guessing at random files — no PR will be opened if nothing was actually changed on the branch.`;

export interface CodeChangeResult {
  prUrl: string | null;
  branch: string;
  summary: string;
  filesChanged: string[];
}

export async function proposeCodeChange(instructions: string): Promise<CodeChangeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY_BRAIN || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY_BRAIN not set");

  const slug = instructions.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "change";
  const branch = `brain/${slug}-${Date.now().toString(36)}`;

  const baseSha = await getBaseBranchSha();
  await createBranch(branch, baseSha);

  const files = await listRepoFiles();
  const client = new Anthropic({ apiKey });
  const filesChanged = new Set<string>();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Requested change:\n${instructions}\n\nFull list of files in the repo (read any of these with read_file before editing):\n${files.join("\n")}`,
    },
  ];

  let summary = "";
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break;

    const finishBlock = toolUses.find((t) => t.name === "finish");
    if (finishBlock) {
      summary = (finishBlock.input as { summary: string }).summary;
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      try {
        if (tool.name === "read_file") {
          const { path } = tool.input as { path: string };
          const file = await readFileOnBranch(path, branch);
          toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: file ? file.content : `File "${path}" does not exist yet.` });
        } else if (tool.name === "write_file") {
          const { path, content, commit_message } = tool.input as { path: string; content: string; commit_message: string };
          await writeFileOnBranch(path, content, branch, commit_message || `Update ${path}`);
          filesChanged.add(path);
          toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: `Committed ${path} to ${branch}.` });
        }
      } catch (e) {
        toolResults.push({ type: "tool_result", tool_use_id: tool.id, is_error: true, content: e instanceof Error ? e.message : "Tool call failed." });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (filesChanged.size === 0) {
    return { prUrl: null, branch, summary: summary || "No files were changed — the request may have been too vague to act on.", filesChanged: [] };
  }

  const pr = await gh(`/repos/${OWNER}/${REPO}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: instructions.slice(0, 70),
      head: branch,
      base: BASE_BRANCH,
      body: `${summary || instructions}\n\n---\nOpened automatically from a Brain chat request. Review the diff before merging — nothing has been built or type-checked.\n\nFiles changed:\n${Array.from(filesChanged).map((f) => `- ${f}`).join("\n")}`,
    }),
  });

  return { prUrl: pr.html_url, branch, summary: summary || instructions, filesChanged: Array.from(filesChanged) };
}
