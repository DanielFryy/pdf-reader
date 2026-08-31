import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Page from "./page";
import { render } from "setupTests";

const pdfjsMock = vi.hoisted(() => ({
  destroyDocument: vi.fn(),
  getDocument: vi.fn(),
  getPage: vi.fn(),
  getViewport: vi.fn(({ scale }: { scale: number }) => ({
    height: 792 * scale,
    width: 612 * scale
  })),
  renderPage: vi.fn(() => ({ cancel: vi.fn(), promise: Promise.resolve() })),
  GlobalWorkerOptions: {
    workerSrc: ""
  }
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: pdfjsMock.GlobalWorkerOptions,
  getDocument: pdfjsMock.getDocument
}));

const pdfFile = new File(["%PDF-1.7 local bytes"], "quiet-reading.pdf", {
  type: "application/pdf"
});

describe("Page", () => {
  const canvasContext = {} as CanvasRenderingContext2D;

  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => canvasContext)
    });
    pdfjsMock.destroyDocument.mockResolvedValue(undefined);
    pdfjsMock.getPage.mockResolvedValue({
      getViewport: pdfjsMock.getViewport,
      render: pdfjsMock.renderPage
    });
    pdfjsMock.getDocument.mockReturnValue({
      promise: Promise.resolve({
        destroy: pdfjsMock.destroyDocument,
        getPage: pdfjsMock.getPage,
        numPages: 3
      })
    });
    localStorage.clear();
  });

  afterEach(() => {
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

    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Reading Surface page 1" })).toBeInTheDocument();
    expect(screen.queryByTitle("Reading Surface")).not.toBeInTheDocument();
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
    expect(pdfjsMock.renderPage).toHaveBeenCalledWith(
      expect.objectContaining({
        background: "#101411",
        canvasContext,
        pageColors: {
          background: "#101411",
          foreground: "#f5f2e9"
        }
      })
    );
    expect(screen.getByText("quiet-reading.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace local PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit to width" })).toBeInTheDocument();
  });

  it("replaces the current Local PDF", async () => {
    const user = userEvent.setup();
    const nextPdfFile = new File(["%PDF-1.7 replacement bytes"], "second-reading.pdf", {
      type: "application/pdf"
    });

    render(<Page />);

    await user.upload(screen.getByLabelText("Open local PDF"), pdfFile);
    expect(await screen.findByText("quiet-reading.pdf")).toBeInTheDocument();

    await user.upload(screen.getByLabelText("Open local PDF"), nextPdfFile);

    expect(await screen.findByText("second-reading.pdf")).toBeInTheDocument();
    expect(screen.queryByText("quiet-reading.pdf")).not.toBeInTheDocument();
    expect(pdfjsMock.destroyDocument).toHaveBeenCalled();
  });

  it("accepts a dropped Local PDF", async () => {
    render(<Page />);

    fireEvent.drop(screen.getByText("Drop a PDF here"), {
      dataTransfer: {
        files: [pdfFile]
      }
    });

    expect(await screen.findByRole("region", { name: "Reading Surface" })).toBeInTheDocument();
  });

  it("resets the current Local PDF", async () => {
    const user = userEvent.setup();

    render(<Page />);

    await user.upload(screen.getByLabelText("Open local PDF"), pdfFile);
    await user.click(screen.getByRole("button", { name: "Close local PDF" }));

    expect(screen.queryByRole("region", { name: "Reading Surface" })).not.toBeInTheDocument();
    expect(screen.getByText("Drop a PDF here")).toBeInTheDocument();
  });

  it("remembers local file metadata without storing PDF bytes", async () => {
    const user = userEvent.setup();

    render(<Page />);

    await user.upload(screen.getByLabelText("Open local PDF"), pdfFile);
    await screen.findByText("Page 1 of 3");

    const [memoryKey] = Object.keys(localStorage);
    const storedMemory = localStorage.getItem(memoryKey ?? "");

    expect(storedMemory).toContain("quiet-reading.pdf");
    expect(storedMemory).toContain(String(pdfFile.size));
    expect(storedMemory).toContain('"lastPage":1');
    expect(storedMemory).toContain('"zoom":"fit-width"');
    expect(storedMemory).not.toContain('"type"');
    expect(storedMemory).not.toContain('"lastOpenedAt"');
    expect(storedMemory).not.toContain("%PDF-1.7 local bytes");
  });
});
