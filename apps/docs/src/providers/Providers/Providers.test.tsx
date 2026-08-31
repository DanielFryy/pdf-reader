import React from "react";

import Providers from "./Providers";
import { render } from "setupTests";

describe("Providers", () => {
  it("renders with default props", () => {
    render(
      <Providers>
        <div />
      </Providers>
    );
  });
});
