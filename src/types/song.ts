export interface Song {
  artist: string;
  name: string;
  youtubeId: string;
  // Backup uploads tried in order if youtubeId won't play for this visitor.
  fallbackIds?: string[];
  // Ids that used to be youtubeId and died; kept so the checker never re-picks them.
  deadIds?: string[];
}
