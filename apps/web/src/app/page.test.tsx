import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Page from "./page";
import { render } from "setupTests";

const pdfFile = new File(["%PDF-1.7 local bytes"], "quiet-reading.pdf", {
  type: "application/pdf"
});

describe("Page", () => {
  const createObjectURL = vi.fn(() => "blob:local-pdf");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL
    });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("opens in quiet Reader Mode", () => {
    render(<Page />);

    expect(screen.getByRole("main", { name: "Reading Workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText("Open local PDF")).toBeInTheDocument();
    expect(screen.getByText("Drop a PDF here")).toBeInTheDocument();
    expect(screen.queryByText(/turborepo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/deploy/i)).not.toBeInTheDocument();
  });

  it("displays a selected Local PDF in the Reading Surface", async () => {
    const user = userEvent.setup();

    render(<Page />);

    await user.upload(screen.getByLabelText("Open local PDF"), pdfFile);

    expect(screen.getByTitle("Reading Surface")).toBeInTheDocument();
    expect(screen.getByText("quiet-reading.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace local PDF" })).toBeInTheDocument();
  });

  it("accepts a dropped Local PDF", () => {
    render(<Page />);

    fireEvent.drop(screen.getByText("Drop a PDF here"), {
      dataTransfer: {
        files: [pdfFile]
      }
    });

    expect(screen.getByTitle("Reading Surface")).toBeInTheDocument();
  });

  it("resets the current Local PDF", async () => {
    const user = userEvent.setup();

    render(<Page />);

    await user.upload(screen.getByLabelText("Open local PDF"), pdfFile);
    await user.click(screen.getByRole("button", { name: "Close local PDF" }));

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-pdf");
    expect(screen.queryByTitle("Reading Surface")).not.toBeInTheDocument();
    expect(screen.getByText("Drop a PDF here")).toBeInTheDocument();
  });

  it("remembers local file metadata without storing PDF bytes", async () => {
    const user = userEvent.setup();

    render(<Page />);

    await user.upload(screen.getByLabelText("Open local PDF"), pdfFile);

    const [memoryKey] = Object.keys(localStorage);
    const storedMemory = localStorage.getItem(memoryKey ?? "");

    expect(storedMemory).toContain("quiet-reading.pdf");
    expect(storedMemory).toContain(String(pdfFile.size));
    expect(storedMemory).toContain('"lastPage":1');
    expect(storedMemory).toContain('"zoom":"native"');
    expect(storedMemory).not.toContain('"type"');
    expect(storedMemory).not.toContain('"lastOpenedAt"');
    expect(storedMemory).not.toContain("%PDF-1.7 local bytes");
  });
});
