import { Song } from "../types/song";
import songList from "./songs.json";

// Edited by scripts/check-songs.mjs — never reorder or delete entries, the
// daily song is picked by index (see helpers/todaysSolution.ts).
export const songs: Song[] = songList;
