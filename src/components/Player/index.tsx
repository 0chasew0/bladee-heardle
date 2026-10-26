import React from "react";
import { IoPlay } from "react-icons/io5";
import ReactGA from "react-ga4";

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

// YT.PlayerState.PLAYING
const PLAYING = 1;
// If a video hasn't started this long after Play, treat it as broken. Some
// blocked videos never fire onError, they just sit there.
const START_TIMEOUT_MS = 8000;

interface Props {
  id: string;
  fallbackIds?: string[];
  currentTry: number;
  songLabel: string;
  onResolvedId?: (id: string) => void;
}

export function Player({
  id,
  fallbackIds = [],
  currentTry,
  songLabel,
  onResolvedId,
}: Props) {
  // We render the <iframe> ourselves so allow="autoplay" is present BEFORE the
  // YouTube IFrame API sets the src. This is the only reliable way to satisfy
  // Chrome's Permissions-Policy autoplay requirement on cross-origin frames.
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = React.useRef<any>(null);

  const candidates = React.useMemo(
    () => [id, ...fallbackIds.filter((f) => f !== id)],
    [id, fallbackIds.join(",")]
  );
  const candidateRef = React.useRef(0);
  const wantsPlayRef = React.useRef(false);
  const startTimerRef = React.useRef<ReturnType<typeof setTimeout>>();

  const currentPlayTime = playTimes[currentTry];

  const [play, setPlay] = React.useState<boolean>(false);
  const [currentTime, setCurrentTime] = React.useState<number>(0);
  const [isReady, setIsReady] = React.useState<boolean>(false);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [failed, setFailed] = React.useState<boolean>(false);

  // Move to the next upload of the same song; true if there was one.
  const tryNextCandidate = React.useCallback(
    (reason: string) => {
      clearTimeout(startTimerRef.current);
      const badId = candidates[candidateRef.current];
      ReactGA.event({
        category: "Player",
        action: "Audio error",
        label: `${songLabel} | ${badId} | ${reason}`,
      });

      candidateRef.current += 1;
      const next = candidates[candidateRef.current];
      if (!next || !playerRef.current) {
        wantsPlayRef.current = false;
        setPlay(false);
        setIsLoading(false);
        setFailed(true);
        return false;
      }
      onResolvedId?.(next);
      try {
        if (wantsPlayRef.current) {
          playerRef.current.loadVideoById(next);
          startTimerRef.current = setTimeout(
            () => tryNextCandidate("start timeout"),
            START_TIMEOUT_MS
          );
        } else {
          playerRef.current.cueVideoById(next);
        }
      } catch (_) {}
      return true;
    },
    [candidates, songLabel, onResolvedId]
  );

  // Initialise (or re-initialise) the YT player when the video id changes.
  // We pass the existing <iframe> element so the API uses the element that
  // already has allow="autoplay" — instead of creating a brand-new iframe
  // without that attribute (which is what react-youtube does).
  React.useEffect(() => {
    let destroyed = false;
    candidateRef.current = 0;
    setFailed(false);
    ensureYTApiLoaded();

    onYTReady(() => {
      if (destroyed || !iframeRef.current) return;
      // Pre-set src so postMessage has a valid targetOrigin from the moment
      // the widget API's internal setInterval fires — prevents the
      // "DOMException: An invalid or illegal string was specified" error.
      iframeRef.current.src =
        `https://www.youtube-nocookie.com/embed/${candidates[0]}` +
        `?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
      playerRef.current = new (window as any).YT.Player(iframeRef.current, {
        events: {
          onReady: () => {
            if (!destroyed) setIsReady(true);
          },
          // 2 bad id, 5 HTML5 error, 100 removed/private, 101/150 embedding
          // disabled or blocked in this country.
          onError: (e: { data: number }) => {
            if (!destroyed) tryNextCandidate(`error ${e.data}`);
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === PLAYING) {
              clearTimeout(startTimerRef.current);
              setIsLoading(false);
              setPlay(true);
            }
          },
        },
      });
    });

    return () => {
      destroyed = true;
      clearTimeout(startTimerRef.current);
      try {
        playerRef.current?.destroy();
      } catch (_) {}
      playerRef.current = null;
      setIsReady(false);
      setPlay(false);
      setCurrentTime(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

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
        wantsPlayRef.current = false;
        setPlay(false);
      }
    }
  }, [play, currentTime, currentPlayTime]);

  const startPlayback = React.useCallback(() => {
    if (!playerRef.current || failed) return;
    try {
      wantsPlayRef.current = true;
      setIsLoading(true);
      playerRef.current.seekTo(0);
      playerRef.current.playVideo();
      clearTimeout(startTimerRef.current);
      startTimerRef.current = setTimeout(
        () => tryNextCandidate("start timeout"),
        START_TIMEOUT_MS
      );
      ReactGA.event({ category: "Player", action: "Played song" });
    } catch (_) {}
  }, [failed, tryNextCandidate]);

  const canPlay = isReady && !failed && !isLoading;

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
      {failed ? (
        <Styled.Error role="alert">
          Today&apos;s audio won&apos;t load in your region or browser. Try
          disabling ad/content blockers and reload — it&apos;s been reported
          automatically.
        </Styled.Error>
      ) : (
        <Styled.PlayButton
          type="button"
          aria-label={isLoading ? "Loading audio" : "Play clip"}
          disabled={!canPlay}
          onClick={startPlayback}
        >
          <IoPlay size={40} color="#fff" />
        </Styled.PlayButton>
      )}
    </>
  );
}
