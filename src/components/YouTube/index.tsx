import React from "react";
import { default as YouTubePlayer } from "react-youtube";

interface Props {
  // Tried in order; the next one loads if YouTube reports an error.
  ids: string[];
}

export function YouTube({ ids }: Props) {
  const unique = React.useMemo(() => Array.from(new Set(ids)), [ids.join(",")]);
  const [index, setIndex] = React.useState(0);
  const id = unique[index];

  if (!id) {
    return (
      <p style={{ margin: "5% 0" }}>
        The video for today&apos;s song is unavailable right now.
      </p>
    );
  }

  return (
    <div style={{ margin: "5% 0", width: "100%", maxWidth: 672 }}>
      {/* Responsive 16:9 instead of a fixed 672px that overflows phones. */}
      <div style={{ position: "relative", paddingTop: "56.25%" }}>
        <YouTubePlayer
          key={id}
          videoId={id}
          onError={() => setIndex((i) => i + 1)}
          className="yt-result-iframe"
          opts={{
            width: "100%",
            height: "100%",
            host: "https://www.youtube-nocookie.com",
            playerVars: {
              autoplay: 1,
              playsinline: 1,
            },
          }}
        />
      </div>
    </div>
  );
}
