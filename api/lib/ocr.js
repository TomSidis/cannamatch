import Anthropic from "@anthropic-ai/sdk";

// Lazy-init: only create client when actually called, avoiding module-level throws
let _client = null;
function getAnthropicClient() {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

const OCR_PROMPT = `You are a pharmacy menu parser for Israeli medical cannabis. Scan this image and extract ONLY the product/strain names. Ignore prices, THC%, stock numbers. Return a JSON array of strings. Output ONLY the JSON array. Example: ["Wedding Cake","Erez","Alaska","אור"]`;

async function parseMenuImageWithAI(imageBuffer, mediaType = "image/jpeg") {
  const client = getAnthropicClient(); // throws if no API key — caught by caller
  const base64 = Buffer.isBuffer(imageBuffer) ? imageBuffer.toString("base64") : imageBuffer;
  const isPdf = mediaType === "application/pdf";
  const sourceBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

  let resp;
  try {
    resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          sourceBlock,
          { type: "text", text: OCR_PROMPT },
        ],
      }],
    });
  } catch (err) {
    // Rethrow with clean message for server.js to catch
    throw new Error(`Anthropic API error: ${err.message}`);
  }

  const raw = (resp.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").trim();

  // Try JSON array parse first
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
  }

  // Fallback: line-split and clean
  return raw
    .split("\n")
    .map((s) => s.replace(/^[\d\.\-\*\"\[\],]+\s*/, "").replace(/["\[\],]$/g, "").trim())
    .filter((s) => s.length >= 2);
}

// ── Fuzzy string matching (typo-correction) ──────────────────────────────
// Re-ranks/confirms Postgres trigram-similarity candidates with a pure-JS
// Levenshtein edit-distance score, so close-but-not-trigram-friendly typos
// (single transposed/missing letters) still resolve to the right catalog id.
function computeLevenshteinDistance(a, b) {
  a = (a || "").toLowerCase();
  b = (b || "").toLowerCase();
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function computeFuzzyMatchScore(query, candidate) {
  const dist = computeLevenshteinDistance(query, candidate);
  const maxLen = Math.max(query.length, candidate.length, 1);
  return 1 - dist / maxLen; // 0..1, 1 = exact match
}

// Pick the best fuzzy match for `query` among `candidates` (array of {id, name, ...}).
// Returns the candidate plus its score, or null if nothing clears the threshold.
function findBestFuzzyMatch(query, candidates, threshold = 0.6) {
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = Math.max(computeFuzzyMatchScore(query, c.name), ...(c.aka || []).map((a) => computeFuzzyMatchScore(query, a)));
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= threshold ? { match: best, score: bestScore } : null;
}

export { parseMenuImageWithAI, computeLevenshteinDistance, computeFuzzyMatchScore, findBestFuzzyMatch };
