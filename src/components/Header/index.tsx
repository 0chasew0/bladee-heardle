import React from "react";
import { IoInformationCircleOutline } from "react-icons/io5";

import * as Styled from "./index.styled";

interface Props {
  openInfoPopUp: () => void;
}

export function Header({ openInfoPopUp }: Props) {
  return (
    <Styled.Container>
      <Styled.Content>
        <IoInformationCircleOutline
          onClick={openInfoPopUp}
          size={30}
          role="button"
          aria-label="How to play"
          tabIndex={0}
          style={{ cursor: "pointer" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openInfoPopUp();
          }}
        />

        <Styled.Logo>Bladee Heardle</Styled.Logo>
        <span />
      </Styled.Content>
    </Styled.Container>
  );
}
