import Page from "./page";
import { render } from "setupTests";

describe("Page", () => {
  it("renders with default props", () => {
    render(<Page />);
  });
});
