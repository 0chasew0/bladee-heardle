import React from "react";
import ReactGA from "react-ga4";

import { Song } from "../../types/song";
import { GuessType } from "../../types/guess";
import { scoreToEmoji } from "../../helpers";

import { Button } from "../Button";
import { YouTube } from "../YouTube";

import * as Styled from "./index.styled";

interface Props {
  didGuess: boolean;
  currentTry: number;
  todaysSolution: Song;
  videoIds: string[];
  guesses: GuessType[];
}

const textForTry = ["Wow!", "Super!", "Congrats!", "Nice!", "Phew!", "Just made it!"];

function useTimeToNextSong(): string {
  const calc = () => {
    const ms = new Date().setHours(24, 0, 0, 0) - Date.now();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const [text, setText] = React.useState(calc);
  React.useEffect(() => {
    const t = setInterval(() => setText(calc()), 30000);
    return () => clearInterval(t);
  }, []);
  return text;
}

export function Result({
  didGuess,
  todaysSolution,
  videoIds,
  guesses,
  currentTry,
}: Props) {
  const timeToNext = useTimeToNextSong();
  const [copied, setCopied] = React.useState(false);

  const shareResult = React.useCallback(async () => {
    const text = scoreToEmoji(guesses);
    ReactGA.event({ category: "Game", action: "Share", label: didGuess ? "won" : "lost" });
    // Native share sheet on phones (Discord, iMessage, etc.), clipboard elsewhere.
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ text });
        return;
      } catch (_) {
        // cancelled or unsupported: fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      window.prompt("Copy your result:", text);
    }
  }, [guesses, didGuess]);

  return (
    <>
      <Styled.ResultTitle>
        {didGuess ? textForTry[currentTry - 1] || "Nice!" : "Unfortunately, that's wrong"}
      </Styled.ResultTitle>
      <Styled.SongTitle>
        Today&apos;s song is {todaysSolution.artist} - {todaysSolution.name}
      </Styled.SongTitle>
      {didGuess && (
        <Styled.Tries>
          You guessed it in {currentTry} {currentTry === 1 ? "try" : "tries"}
        </Styled.Tries>
      )}
      <YouTube ids={videoIds} />
      <Button onClick={shareResult} variant="green">
        {copied ? "Copied!" : "Share results"}
      </Button>
      <Styled.TimeToNext>Next song in {timeToNext}</Styled.TimeToNext>
    </>
  );
}
