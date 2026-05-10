/**
 * Cheap detection heuristics for low-signal node descriptions.
 *
 * Each heuristic is pure: takes a description (and optional context) and returns
 * a Finding or null. They're deliberately simple (regex + token overlap) so they
 * can run during compile without a model loop. Mid- and high-cost heuristics
 * (embeddings, LLM-as-judge) live elsewhere and call into these as a baseline.
 *
 * The methodology and thresholds are documented in
 * specs/2026-05-10-authoring-audit-heuristics.md. Adjust thresholds via the
 * function arguments rather than editing constants — defaults match what caught
 * the cases in the 2026-05-10 sweep.
 */

import type { Finding, NodeAuditInput } from "./types.js";

const VAGUE_WORDS = [
  "various",
  "different",
  "related",
  "relevant",
  "covers",
  "discusses",
  "stuff",
  "things",
];

const QUESTION_WORDS = ["How", "What", "Why", "Where", "When"];

/**
 * TOC enumeration: description tail (after em-dash) restates child node names.
 *
 * Anti-pattern example:
 *   description: "How Spandrel knowledge graphs are shaped — nodes, links, paths, and companion files"
 *   children: ["Nodes", "Links", "Paths", "Companion files"]
 *
 * The reader can already see the child names in any list view; restating them
 * tells them what's in the doc, not what it claims.
 *
 * @param threshold - Jaccard overlap ≥ this triggers (default 0.5)
 * @param minMatches - At least this many overlapping tokens required (default 3)
 */
export function detectTocOverlap(
  description: string,
  childNames: string[],
  threshold = 0.5,
  minMatches = 3,
): Finding | null {
  if (childNames.length === 0) return null;

  // Tokenize the tail — content after the first em-dash if present.
  const emDashIdx = description.indexOf("—");
  const tail = emDashIdx >= 0 ? description.slice(emDashIdx + 1) : description;
  const tailTokens = tokenize(tail);
  if (tailTokens.length === 0) return null;

  // Tokenize child names into a set.
  const childTokenSet = new Set(childNames.flatMap(tokenize));

  const matches = tailTokens.filter((t) => childTokenSet.has(t));
  const overlap = matches.length / tailTokens.length;

  if (overlap >= threshold && matches.length >= minMatches) {
    return {
      kind: "toc_overlap",
      severity: "advisory",
      message: `Description appears to enumerate child names (${matches.length}/${tailTokens.length} tokens match)`,
      detail: {
        overlap: Number(overlap.toFixed(2)),
        matches: matches.length,
        totalTailTokens: tailTokens.length,
        matchedTokens: matches,
      },
    };
  }
  return null;
}

/**
 * Vague qualifiers leak signal: "various", "different", "related", "relevant",
 * "covers", "discusses", "stuff", "things". Each is a placeholder for a
 * specific that should have been named.
 *
 * @param minMatches - At least this many vague words required (default 2)
 */
export function detectVagueQualifiers(
  description: string,
  minMatches = 2,
): Finding | null {
  const lower = description.toLowerCase();
  const matches: string[] = [];
  for (const word of VAGUE_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, "g");
    const found = lower.match(re);
    if (found) matches.push(...found);
  }
  if (matches.length >= minMatches) {
    return {
      kind: "vague_qualifiers",
      severity: "advisory",
      message: `Description contains vague qualifiers: ${matches.join(", ")}`,
      detail: { matches },
    };
  }
  return null;
}

/**
 * Topic-style framing: starts with How/What/Why/Where/When and is short
 * overall — the reader gets a topic but no concrete claims.
 *
 * Substantive descriptions can also begin with question words (e.g.
 * "What Spandrel believes about agent-friendly knowledge graphs..." with
 * 35 words). The word-count threshold separates them.
 *
 * @param maxWords - Description with question-word opening shorter than this triggers (default 15)
 */
export function detectTopicOpening(
  description: string,
  maxWords = 15,
): Finding | null {
  const words = description.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const firstWord = words[0];

  if (!QUESTION_WORDS.includes(firstWord)) return null;
  if (words.length > maxWords) return null;

  return {
    kind: "topic_opening",
    severity: "advisory",
    message: `Description leads with topic-style framing without enough substance (${words.length} words)`,
    detail: { wordCount: words.length, openingWord: firstWord },
  };
}

/**
 * Composite nodes (≥ 1 child) with very short descriptions probably aren't
 * giving the reader enough to decide whether to drill in. Leaves can get away
 * with terse descriptions because there's nowhere to drill.
 *
 * @param minWords - Composite description shorter than this triggers (default 8)
 */
export function detectThinness(
  description: string,
  hasChildren: boolean,
  minWords = 8,
): Finding | null {
  if (!hasChildren) return null;
  const wordCount = description.split(/\s+/).filter(Boolean).length;
  if (wordCount < minWords) {
    return {
      kind: "thin",
      severity: "advisory",
      message: `Description is short (${wordCount} words) for a composite node`,
      detail: { wordCount },
    };
  }
  return null;
}

/**
 * Tautology: description contains the node's own name verbatim and adds little
 * else. The reader gains no information from the duplication.
 *
 * Example anti-pattern:
 *   name: "Acme"
 *   description: "The Acme client" (other words: 0 substantive)
 *
 * @param minOtherWords - Substantive (>2 char) words besides the name required (default 5)
 */
export function detectTautology(
  description: string,
  name: string,
  minOtherWords = 5,
): Finding | null {
  const lower = description.toLowerCase();
  const nameLower = name.toLowerCase();
  if (!nameLower || !lower.includes(nameLower)) return null;

  const remaining = lower.replace(nameLower, "").trim();
  const otherWords = remaining.split(/\s+/).filter((t) => t.length > 2);

  if (otherWords.length < minOtherWords) {
    return {
      kind: "tautology",
      severity: "advisory",
      message: `Description repeats the node's name with little else (${otherWords.length} substantive words besides the name)`,
      detail: { otherWordCount: otherWords.length, name },
    };
  }
  return null;
}

/**
 * Run all cheap heuristics against a single node. Returns every Finding that
 * fires; an empty array means clean.
 *
 * Callers (compiler, CLI, tests) compose this with their own iteration over
 * the graph. This module stays pure — no I/O, no graph traversal.
 */
export function auditNode(input: NodeAuditInput): Finding[] {
  const findings: Finding[] = [];

  const tocFinding = detectTocOverlap(input.description, input.childNames);
  if (tocFinding) findings.push(tocFinding);

  const vagueFinding = detectVagueQualifiers(input.description);
  if (vagueFinding) findings.push(vagueFinding);

  const topicFinding = detectTopicOpening(input.description);
  if (topicFinding) findings.push(topicFinding);

  const thinFinding = detectThinness(
    input.description,
    input.childNames.length > 0,
  );
  if (thinFinding) findings.push(thinFinding);

  const tautologyFinding = detectTautology(input.description, input.name);
  if (tautologyFinding) findings.push(tautologyFinding);

  return findings;
}

/**
 * Tokenize a string into lowercase content words: split on whitespace, commas,
 * and hyphens; drop tokens of ≤ 2 characters and pure-punctuation tokens.
 *
 * Used by detectTocOverlap to compare the description tail against child
 * names. Conservative on what counts as a token to avoid noise from
 * articles ("the", "and", "of") and punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;\-_/()]+/)
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter((t) => t.length > 2);
}
