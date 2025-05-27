import { songs } from "../constants";

// const epochMs = new Date(2022, 3, 10).valueOf();
// const now = Date.now();
// const index = Math.floor((now - epochMs) / msInDay);

const msInDay = 86400000;
const startDate = new Date('5/27/2025');
const todaysDate = new Date();
const index = Math.floor((todaysDate.getTime() - startDate.getTime() )/msInDay)

export const todaysSolution = songs[index % songs.length];
