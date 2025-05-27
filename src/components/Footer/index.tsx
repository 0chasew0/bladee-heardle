import React from "react";
import { IoHeart } from "react-icons/io5";

import * as Styled from "./index.styled";

export function Footer() {
  return (
    <footer>
      <Styled.Text>
        Made with <IoHeart /> by{" "}
        <Styled.Link href="https://discord.gg/QBZUtqN6N7">
          Noodle Studios
        </Styled.Link>
      </Styled.Text>
      <Styled.Text>
      Fork of {" "}
        <Styled.Link href="https://github.com/sarvarghese/youtube-heardle-template?tab=readme-ov-file">
          Heardle Template by Sarvarghese and Shizerq
        </Styled.Link>
      </Styled.Text>
    </footer>
  );
}
