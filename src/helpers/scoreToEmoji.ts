import { GuessType } from "../types/guess";
import { puzzleNumber } from "./todaysSolution";

export function scoreToEmoji(guesses: GuessType[]): string {
  const emojis = {
    incorrect: "🟥",
    correct: "🟩",
    skip: "⬜",
    empty: "⬛️",
  };
  const prefix = `Bladee Heardle - #${puzzleNumber} 🎧`;

  let scoreEmoji = "";

  guesses.forEach((guess: GuessType) => {
    if (guess.isCorrect === true) {
      scoreEmoji += emojis.correct;
    } else if (guess.skipped === true) {
      scoreEmoji += emojis.skip;
    } else if (guess.isCorrect === false) {
      scoreEmoji += emojis.incorrect;
    } else {
      scoreEmoji += emojis.empty;
    }
  });

  // The link is what turns a pasted score into a new player.
  return `${prefix} ${scoreEmoji}\n${window.location.origin}`;
}
