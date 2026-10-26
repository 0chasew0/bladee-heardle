import React from "react";

import { GuessType } from "../../types/guess";
import { Song } from "../../types/song";
import { playTimes } from "../../constants";

import { Button, Guess, Player, Search, Result } from "../";

import * as Styled from "./index.styled";

interface Props {
  guesses: GuessType[];
  todaysSolution: Song;
  currentTry: number;
  maxTries: number;
  didGuess: boolean;
  setSelectedSong: React.Dispatch<React.SetStateAction<Song | undefined>>;
  skip: () => void;
  guess: () => void;
}

export function Game({
  guesses,
  todaysSolution,
  currentTry,
  maxTries,
  didGuess,
  setSelectedSong,
  skip,
  guess,
}: Props) {
  // Whichever upload actually played, so the result video doesn't hit the same dead id.
  const [resolvedId, setResolvedId] = React.useState(todaysSolution.youtubeId);

  if (didGuess || currentTry >= maxTries) {
    return (
      <Result
        didGuess={didGuess}
        currentTry={currentTry}
        todaysSolution={todaysSolution}
        videoIds={[
          resolvedId,
          todaysSolution.youtubeId,
          ...(todaysSolution.fallbackIds || []),
        ]}
        guesses={guesses}
      />
    );
  }
  return (
    <>
      {guesses.map((guess: GuessType, index) => (
        <Guess
          key={index}
          guess={guess}
          isCorrect={guess.isCorrect}
          active={index === currentTry}
        />
      ))}
      <Player
        id={todaysSolution.youtubeId}
        fallbackIds={todaysSolution.fallbackIds}
        songLabel={`${todaysSolution.artist} - ${todaysSolution.name}`}
        currentTry={currentTry}
        onResolvedId={setResolvedId}
      />
      <Search currentTry={currentTry} setSelectedSong={setSelectedSong} />

      <Styled.Buttons>
        <Button onClick={skip}>
          {currentTry === maxTries - 1
            ? "Give Up"
            : `Skip +${(playTimes[currentTry + 1] - playTimes[currentTry]) / 1000}s`}
        </Button>
        <Button variant="green" onClick={guess}>
          Submit
        </Button>
      </Styled.Buttons>
    </>
  );
}
