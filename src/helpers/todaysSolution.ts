import { songs } from "../constants";

// Whole calendar days between two local dates. Comparing UTC midnights of the
// local calendar dates avoids the DST bug where (now - start) / 86400000 is an
// hour short after the clocks spring forward, serving yesterday's song until 1am.
function daysSince(year: number, month: number, day: number): number {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - Date.UTC(year, month - 1, day)) / 86400000);
}

// Dev only: ?day=N previews the song for rotation day N.
const devDay =
  process.env.NODE_ENV === "development"
    ? new URLSearchParams(window.location.search).get("day")
    : null;

// Rotation restarted on 2026-02-27 when the song list was expanded.
export const dayIndex = devDay !== null ? Number(devDay) : daysSince(2026, 2, 27);

// Puzzle number shown in shared results, counted from the site's launch.
export const puzzleNumber = daysSince(2025, 5, 27) + 1;

export const todaysSolution = songs[dayIndex % songs.length];
