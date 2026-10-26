import ReactGA from "react-ga4";

import React from "react";

import { Song } from "./types/song";
import { GuessType } from "./types/guess";

import { todaysSolution, dayIndex } from "./helpers";
import { playTimes } from "./constants";

import { Header, InfoPopUp, Game, Footer } from "./components";

import * as Styled from "./app.styled";

const MAX_TRIES = playTimes.length;

const emptyGuess: GuessType = {
  song: undefined,
  skipped: false,
  isCorrect: undefined,
};

interface DayStats {
  day?: number;
  solution: Song;
  currentTry: number;
  didGuess: boolean;
  guesses?: GuessType[];
}

function loadStats(): DayStats[] {
  try {
    const stats = JSON.parse(localStorage.getItem("stats") || "[]");
    return Array.isArray(stats) ? stats : [];
  } catch {
    return [];
  }
}

// Match on the day, not the song object: the checker swaps youtubeIds, and a
// deep-equal on the song would wipe a player's in-progress game for that day.
function isToday(entry: DayStats | undefined): boolean {
  if (!entry) return false;
  if (entry.day !== undefined) return entry.day === dayIndex;
  return (
    entry.solution?.name === todaysSolution.name &&
    entry.solution?.artist === todaysSolution.artist
  );
}

function padGuesses(guesses: GuessType[] | undefined): GuessType[] {
  const out = [...(guesses || [])];
  while (out.length < MAX_TRIES) out.push(emptyGuess);
  return out;
}

function App() {
  const [stats] = React.useState<DayStats[]>(() => {
    const loaded = loadStats();
    if (!isToday(loaded[loaded.length - 1])) {
      loaded.push({
        day: dayIndex,
        solution: todaysSolution,
        currentTry: 0,
        didGuess: false,
      });
    }
    return loaded;
  });
  const today = stats[stats.length - 1];

  const [guesses, setGuesses] = React.useState<GuessType[]>(() =>
    padGuesses(today.guesses)
  );
  const [currentTry, setCurrentTry] = React.useState<number>(
    today.currentTry || 0
  );
  const [selectedSong, setSelectedSong] = React.useState<Song>();
  const [didGuess, setDidGuess] = React.useState<boolean>(!!today.didGuess);

  React.useEffect(() => {
    Object.assign(today, { day: dayIndex, currentTry, didGuess, guesses });
    try {
      localStorage.setItem("stats", JSON.stringify(stats));
    } catch {
      // Private mode / storage full: the game still works, it just won't resume.
    }
  }, [guesses, currentTry, didGuess]);

  const [isInfoPopUpOpen, setIsInfoPopUpOpen] = React.useState<boolean>(
    () => localStorage.getItem("firstRun") === null
  );

  const openInfoPopUp = React.useCallback(() => {
    setIsInfoPopUpOpen(true);
  }, []);

  const closeInfoPopUp = React.useCallback(() => {
    localStorage.setItem("firstRun", "false");
    setIsInfoPopUpOpen(false);
  }, []);

  const skip = React.useCallback(() => {
    setGuesses((guesses: GuessType[]) => {
      const newGuesses = [...guesses];
      newGuesses[currentTry] = {
        song: undefined,
        skipped: true,
        isCorrect: undefined,
      };

      return newGuesses;
    });

    setCurrentTry((currentTry) => currentTry + 1);

    ReactGA.event({
      category: "Game",
      action: "Skip",
    });
  }, [currentTry]);

  const guess = React.useCallback(() => {
    if (!selectedSong) {
      alert("Choose a song");
      return;
    }

    const isCorrect =
      selectedSong.name === todaysSolution.name &&
      selectedSong.artist === todaysSolution.artist;

    setGuesses((guesses: GuessType[]) => {
      const newGuesses = [...guesses];
      newGuesses[currentTry] = {
        song: selectedSong,
        skipped: false,
        isCorrect: isCorrect,
      };

      return newGuesses;
    });

    setCurrentTry((currentTry) => currentTry + 1);
    setSelectedSong(undefined);

    if (isCorrect) {
      setDidGuess(true);
    }

    ReactGA.event({
      category: "Game",
      action: "Guess",
      label: `${selectedSong.artist} - ${selectedSong.name}`,
      value: isCorrect ? 1 : 0,
    });
  }, [currentTry, selectedSong]);

  return (
    <main>
      <Header openInfoPopUp={openInfoPopUp} />
      {isInfoPopUpOpen && <InfoPopUp onClose={closeInfoPopUp} />}
      <Styled.Container>
        <Game
          guesses={guesses}
          didGuess={didGuess}
          todaysSolution={todaysSolution}
          currentTry={currentTry}
          maxTries={MAX_TRIES}
          setSelectedSong={setSelectedSong}
          skip={skip}
          guess={guess}
        />
      </Styled.Container>
      <Footer />
    </main>
  );
}

export default App;
