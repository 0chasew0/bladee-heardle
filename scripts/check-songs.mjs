#!/usr/bin/env node
// Checks every song's YouTube video and heals broken ones.
//
//   node scripts/check-songs.mjs            report only (exit 1 if anything is broken)
//   node scripts/check-songs.mjs --fix      replace dead ids with a working fallback or a search match
//   node scripts/check-songs.mjs --fix --fill-fallbacks   also add backup ids to songs that have none
//
// Set YOUTUBE_API_KEY (free, YouTube Data API v3) for reliable checks: all 248
// songs cost 5 API calls. Without it the script scrapes watch pages slowly, and
// YouTube starts throttling after a few hundred requests.
//
// Why not oEmbed: it returns 200 for region/label-blocked videos, so it misses
// most real breakage. We use playabilityStatus (what the embedded player uses)
// or the Data API's status/regionRestriction.
//
// Song order is never changed: the daily song is songs[day % songs.length], so
// adding, removing or reordering entries would change today's (and every past) answer.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SONGS_FILE = path.join(ROOT, "src/constants/songs.json");
const REPORT_FILE = path.join(ROOT, "song-report.md");

const args = new Set(process.argv.slice(2));
const FIX = args.has("--fix");
const FILL = args.has("--fill-fallbacks");
const API_KEY = process.env.YOUTUBE_API_KEY;
// Countries a video must play in. Most players are here; others get client-side fallbacks.
const REGIONS = (process.env.HEARDLE_REGIONS || "US").split(",");
const MAX_FALLBACKS = 2;
const SCRAPE_DELAY_MS = 1500;

const HEADERS = {
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  cookie: "CONSENT=YES+1",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Throttled extends Error {}

let lastScrape = 0;
async function scrape(url) {
  const wait = lastScrape + SCRAPE_DELAY_MS - Date.now();
  lastScrape = Date.now() + Math.max(0, wait);
  if (wait > 0) await sleep(wait);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    if (html.includes("ytInitialData") || html.includes("ytInitialPlayerResponse")) return html;
    // 429, a redirect to /sorry/, or an empty 204 all mean we're being rate limited.
    await sleep(15000 * (attempt + 1));
  }
  throw new Throttled(`YouTube is throttling requests (${url})`);
}

// --- video status -----------------------------------------------------------
// Every check resolves to { ok: true | false | null, status, reason, seconds }.
// ok === null means "couldn't tell"; the script never changes a song on that.

const statusCache = new Map();

function parseIsoDuration(iso) {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : undefined;
}

async function apiStatuses(ids) {
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url =
      `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails,snippet` +
      `&id=${batch.join(",")}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
    const { items = [] } = await res.json();
    const found = new Map(items.map((v) => [v.id, v]));
    for (const id of batch) {
      const v = found.get(id);
      let r;
      if (!v) r = { ok: false, status: "GONE", reason: "deleted or private" };
      else if (v.status.uploadStatus !== "processed") r = { ok: false, status: "GONE", reason: v.status.uploadStatus };
      else if (v.status.privacyStatus === "private") r = { ok: false, status: "GONE", reason: "private" };
      else if (!v.status.embeddable) r = { ok: false, status: "EMBED_DISABLED", reason: "owner disabled embedding" };
      else {
        const rr = v.contentDetails.regionRestriction || {};
        const blocked = REGIONS.filter(
          (c) => rr.blocked?.includes(c) || (rr.allowed && !rr.allowed.includes(c))
        );
        r = blocked.length
          ? { ok: false, status: "REGION_BLOCKED", reason: `blocked in ${blocked.join(",")}` }
          : { ok: true, status: "OK", reason: "" };
      }
      r.seconds = parseIsoDuration(v?.contentDetails?.duration);
      statusCache.set(id, r);
    }
  }
}

async function scrapeStatus(id) {
  const html = await scrape(`https://www.youtube.com/watch?v=${id}&hl=en`);
  const ps = html.match(/"playabilityStatus":\{"status":"([A-Z_]+)"(?:,"reason":"([^"]*)")?/);
  const embed = html.match(/"playableInEmbed":(true|false)/);
  const seconds = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1]) || undefined;
  if (!ps) return { ok: null, status: "UNKNOWN", reason: "could not read page", seconds };
  if (ps[1] === "LOGIN_REQUIRED") return { ok: false, status: "AGE_RESTRICTED", reason: ps[2] || "", seconds };
  if (ps[1] !== "OK") return { ok: false, status: ps[1], reason: ps[2] || "", seconds };
  if (embed?.[1] === "false") return { ok: false, status: "EMBED_DISABLED", reason: "owner disabled embedding", seconds };
  return { ok: true, status: "OK", reason: "", seconds };
}

async function checkVideo(id) {
  if (!statusCache.has(id)) {
    if (API_KEY) await apiStatuses([id]);
    else statusCache.set(id, await scrapeStatus(id));
  }
  return statusCache.get(id);
}

// The API can't see label/age blocks that only show up in the player, so
// replacement candidates also get one watch-page check when that's possible.
async function confirmPlayable(id) {
  if ((await checkVideo(id)).ok !== true) return false;
  if (!API_KEY) return true; // checkVideo already scraped it
  try {
    return (await scrapeStatus(id)).ok !== false;
  } catch (err) {
    if (err instanceof Throttled) return true;
    throw err;
  }
}

// --- finding replacements ---------------------------------------------------

async function searchYouTube(query) {
  if (API_KEY) {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10` +
      `&q=${encodeURIComponent(query)}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
    const { items = [] } = await res.json();
    const ids = items.map((i) => i.id.videoId);
    await apiStatuses(ids.filter((id) => !statusCache.has(id)));
    return items.map((i) => ({
      id: i.id.videoId,
      title: i.snippet.title.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
      channel: i.snippet.channelTitle,
      seconds: statusCache.get(i.id.videoId)?.seconds,
    }));
  }

  const html = await scrape(`https://www.youtube.com/results?hl=en&search_query=${encodeURIComponent(query)}`);
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      const len = v.lengthText?.simpleText || "";
      out.push({
        id: v.videoId,
        title: (v.title?.runs || []).map((r) => r.text).join(""),
        channel: v.ownerText?.runs?.[0]?.text || "",
        seconds: len.split(":").reduce((acc, n) => acc * 60 + Number(n), 0) || undefined,
      });
    }
    for (const k in o) walk(o[k]);
  })(JSON.parse(m[1]));
  return out;
}

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ") // drop "(ft. x)", "(prod. y)"
    .replace(/\b(ft|feat|prod)\b.*$/, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const BAD_WORDS =
  /\b(live|slowed|reverb|sped|nightcore|remix|cover|instrumental|8d|lyrics?|bass ?boosted|1 hour|loop|reacts?|reaction|review|snippet|leak)\b/i;

const artistNames = (artist) =>
  artist
    .split(/\s*(?:\+|&|,|\bx\b|\band\b)\s*/i)
    .map(norm)
    .filter(Boolean);

// Higher is better; null = reject.
function scoreCandidate(song, cand, originalSeconds) {
  const want = norm(song.name);
  const title = norm(cand.title);
  const where = `${title} ${norm(cand.channel)}`;
  if (!want || !title.includes(want)) return null;
  // Must credit one of the song's artists, or "Hocus Pocus" matches someone else's "Hocus Pocus".
  if (!artistNames(song.artist).some((a) => where.includes(a))) return null;
  // "Grace (Salem Remix)" must not match plain "Grace": require the remixer's name.
  const remix = song.name.match(/\(([^)]*\b(?:remix|mix)\b[^)]*)\)/i);
  if (remix && !title.includes(norm(remix[1]).split(" ")[0])) return null;
  // Don't trade a clean upload for a "slowed + reverb" one unless the song itself is a remix.
  if (BAD_WORDS.test(cand.title.replace(/\(.*?remix.*?\)/i, "")) && !remix) return null;
  if (cand.seconds && cand.seconds > 15 * 60) return null;

  let score = 0;
  if (/ - Topic$/.test(cand.channel)) score += 50; // official auto-generated audio = same master
  if (/bladee|drain ?gang|year0001|ecco2k|thaiboy|yung lean|sad boys/i.test(cand.channel)) score += 30;
  if (title === want) score += 10;
  if (originalSeconds && cand.seconds) {
    const diff = Math.abs(originalSeconds - cand.seconds);
    if (diff <= 3) score += 25; // same length usually means the same intro
    else if (diff <= 10) score += 5;
    else return null; // different edit: the intro clip would be wrong
  }
  return score;
}

async function findReplacements(song, originalSeconds, exclude) {
  const results = await searchYouTube(`${song.artist} ${song.name}`);
  const ranked = results
    .filter((c) => !exclude.has(c.id))
    .map((c) => ({ ...c, score: scoreCandidate(song, c, originalSeconds) }))
    .filter((c) => c.score !== null)
    .sort((a, b) => b.score - a.score);

  const good = [];
  for (const cand of ranked.slice(0, 5)) {
    if (await confirmPlayable(cand.id)) good.push(cand);
    if (good.length >= MAX_FALLBACKS + 1) break;
  }
  return good;
}

// --- main -------------------------------------------------------------------

async function processSong(song, index) {
  const entry = { index, song: `${song.artist} - ${song.name}`, changes: [] };
  const primary = await checkVideo(song.youtubeId);
  entry.primary = primary;

  const fallbacks = [];
  for (const id of song.fallbackIds || []) {
    const r = await checkVideo(id);
    if (r.ok === false) entry.changes.push(`dropped dead fallback ${id}`);
    else fallbacks.push(id);
  }

  const exclude = new Set([song.youtubeId, ...(song.deadIds || []), ...fallbacks]);

  if (primary.ok === null) {
    entry.state = "unknown";
  } else if (primary.ok) {
    entry.state = "ok";
    if (FILL && fallbacks.length === 0) {
      for (const c of (await findReplacements(song, primary.seconds, exclude)).slice(0, MAX_FALLBACKS)) {
        fallbacks.push(c.id);
        entry.changes.push(`added fallback ${c.id} (${c.channel}: ${c.title})`);
      }
    }
  } else {
    const found = await findReplacements(song, primary.seconds, exclude);
    // A fresh search result beats a stale fallback, but use the fallback if search finds nothing.
    const best = found[0] || (fallbacks.length ? { id: fallbacks[0], channel: "fallback", title: "" } : null);
    if (best) {
      entry.changes.push(
        `replaced ${song.youtubeId} (${primary.status}${primary.reason ? ": " + primary.reason : ""}) ` +
          `with ${best.id} (${best.channel}${best.title ? ": " + best.title : ""})`
      );
      song.deadIds = [...new Set([...(song.deadIds || []), song.youtubeId])];
      song.youtubeId = best.id;
      for (const c of found.slice(1)) if (!fallbacks.includes(c.id)) fallbacks.push(c.id);
      entry.state = "healed";
    } else {
      entry.state = "broken";
    }
  }

  const keep = fallbacks.filter((id) => id !== song.youtubeId).slice(0, MAX_FALLBACKS);
  if (keep.length) song.fallbackIds = keep;
  else delete song.fallbackIds;
  return entry;
}

function writeSongs(songs) {
  // One song per line keeps diffs readable.
  const body = songs.map((s) => "  " + JSON.stringify(s)).join(",\n");
  fs.writeFileSync(SONGS_FILE, `[\n${body}\n]\n`);
}

async function main() {
  const songs = JSON.parse(fs.readFileSync(SONGS_FILE, "utf8"));
  console.error(`Checking ${songs.length} songs via ${API_KEY ? "YouTube Data API" : "page scraping (slow)"}…`);

  if (API_KEY) await apiStatuses([...new Set(songs.flatMap((s) => [s.youtubeId, ...(s.fallbackIds || [])]))]);

  const entries = [];
  let aborted = "";
  for (let i = 0; i < songs.length; i++) {
    try {
      entries.push(await processSong(songs[i], i));
    } catch (err) {
      if (!(err instanceof Throttled)) throw err;
      aborted = err.message;
      break; // keep what we have; the next run continues to make progress
    }
    process.stderr.write(`\r${i + 1}/${songs.length}`);
  }
  process.stderr.write("\n");

  const broken = entries.filter((e) => e.state === "broken");
  const unknown = entries.filter((e) => e.state === "unknown");
  const healed = entries.filter((e) => e.state === "healed");
  const changed = entries.filter((e) => e.changes.length);

  const lines = [
    `# Song check — ${new Date().toISOString()}`,
    "",
    `${entries.length}/${songs.length} songs checked · ${healed.length} ${FIX ? "healed" : "healable"} · ` +
      `${broken.length} broken with no replacement · ${unknown.length} inconclusive`,
    "",
  ];
  if (aborted) lines.push(`> Stopped early: ${aborted}. Set YOUTUBE_API_KEY to avoid this.`, "");
  if (broken.length) {
    lines.push("## Needs a human", "");
    for (const e of broken)
      lines.push(`- #${e.index} **${e.song}** — \`${songs[e.index].youtubeId}\` ${e.primary.status} ${e.primary.reason}`);
    lines.push("");
  }
  if (changed.length) {
    lines.push(`## ${FIX ? "Changes made" : "Proposed changes (run with --fix)"}`, "");
    for (const e of changed) lines.push(`- #${e.index} **${e.song}** — ${e.changes.join("; ")}`);
    lines.push("");
  }
  if (unknown.length) {
    lines.push("## Inconclusive (left unchanged)", "");
    for (const e of unknown) lines.push(`- #${e.index} ${e.song}`);
    lines.push("");
  }
  fs.writeFileSync(REPORT_FILE, lines.join("\n"));
  console.log(lines.join("\n"));

  if (FIX) writeSongs(songs);
  // Non-zero tells CI to open an issue / PR.
  process.exitCode = broken.length || (!FIX && healed.length) ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
