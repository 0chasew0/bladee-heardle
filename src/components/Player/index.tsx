import React from "react";
import { IoPlay } from "react-icons/io5";
import { event } from "react-ga";

import { playTimes } from "../../constants";

import * as Styled from "./index.styled";

// ---------------------------------------------------------------------------
// YouTube IFrame API bootstrap (loaded once per page)
// ---------------------------------------------------------------------------
let ytScriptLoaded = false;
let ytApiReady = false;
const ytReadyCallbacks: Array<() => void> = [];

function ensureYTApiLoaded() {
  if (ytScriptLoaded) return;
  ytScriptLoaded = true;

  // Already available (e.g. dev hot-reload)
  if ((window as any).YT && (window as any).YT.Player) {
    ytApiReady = true;
    return;
  }

  const prev = (window as any).onYouTubeIframeAPIReady;
  (window as any).onYouTubeIframeAPIReady = () => {
    if (prev) prev();
    ytApiReady = true;
    ytReadyCallbacks.forEach((cb) => cb());
    ytReadyCallbacks.length = 0;
  };

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(script);
}

function onYTReady(cb: () => void) {
  if (ytApiReady) {
    cb();
  } else {
    ytReadyCallbacks.push(cb);
  }
}
// ---------------------------------------------------------------------------

interface Props {
  id: string;
  currentTry: number;
}

export function Player({ id, currentTry }: Props) {
  // We render the <iframe> ourselves so allow="autoplay" is present BEFORE the
  // YouTube IFrame API sets the src. This is the only reliable way to satisfy
  // Chrome's Permissions-Policy autoplay requirement on cross-origin frames.
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = React.useRef<any>(null);

  const currentPlayTime = playTimes[currentTry];

  const [play, setPlay] = React.useState<boolean>(false);
  const [currentTime, setCurrentTime] = React.useState<number>(0);
  const [isReady, setIsReady] = React.useState<boolean>(false);

  // Initialise (or re-initialise) the YT player when the video id changes.
  // We pass the existing <iframe> element so the API uses the element that
  // already has allow="autoplay" — instead of creating a brand-new iframe
  // without that attribute (which is what react-youtube does).
  React.useEffect(() => {
    let destroyed = false;
    ensureYTApiLoaded();

    onYTReady(() => {
      if (destroyed || !iframeRef.current) return;
      // Pre-set src so postMessage has a valid targetOrigin from the moment
      // the widget API's internal setInterval fires — prevents the
      // "DOMException: An invalid or illegal string was specified" error.
      iframeRef.current.src =
        `https://www.youtube-nocookie.com/embed/${id}` +
        `?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
      playerRef.current = new (window as any).YT.Player(iframeRef.current, {
        events: {
          onReady: () => { if (!destroyed) setIsReady(true); },
        },
      });
    });

    return () => {
      destroyed = true;
      try { playerRef.current?.destroy(); } catch (_) {}
      playerRef.current = null;
      setIsReady(false);
      setPlay(false);
      setCurrentTime(0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll playback position at 250 ms
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (!playerRef.current) return;
      try {
        const t = playerRef.current.getCurrentTime();
        if (typeof t === "number") setCurrentTime(t);
      } catch (_) {}
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // Stop when we reach the allowed clip length
  React.useEffect(() => {
    if (play && playerRef.current) {
      if (currentTime * 1000 >= currentPlayTime) {
        try {
          playerRef.current.pauseVideo();
          playerRef.current.seekTo(0);
        } catch (_) {}
        setPlay(false);
      }
    }
  }, [play, currentTime, currentPlayTime]);

  const startPlayback = React.useCallback(() => {
    if (!playerRef.current) return;
    try {
      playerRef.current.playVideo();
      setPlay(true);
      event({ category: "Player", action: "Played song" });
    } catch (_) {}
  }, []);

  return (
    <>
      {/*
        allow="autoplay" is a React prop set before the YT API navigates the
        frame, so Chrome grants the autoplay Permissions-Policy for this iframe.
      */}
      <iframe
        ref={iframeRef}
        allow="autoplay; encrypted-media"
        style={{ width: 0, height: 0, border: "none", position: "absolute" }}
        title="YouTube audio player"
      />
      <Styled.ProgressBackground>
        {currentTime !== 0 && <Styled.Progress value={currentTime} />}
        {playTimes.map((playTime) => (
          <Styled.Separator
            style={{ left: `${(playTime / 16000) * 100}%` }}
            key={playTime}
          />
        ))}
      </Styled.ProgressBackground>
      <Styled.TimeStamps>
        <Styled.TimeStamp>1s</Styled.TimeStamp>
        <Styled.TimeStamp>16s</Styled.TimeStamp>
      </Styled.TimeStamps>
      <IoPlay
        style={{ cursor: isReady ? "pointer" : "not-allowed", opacity: isReady ? 1 : 0.4 }}
        size={40}
        color="#fff"
        onClick={isReady ? startPlayback : undefined}
      />
    </>
  );
}
