import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Page from "./page";
import { render } from "setupTests";

const pdfjsMock = vi.hoisted(() => {
  const cancelRender = vi.fn();

  return {
    cancelRender,
    destroyDocument: vi.fn(),
    getDocument: vi.fn(),
    getPage: vi.fn(),
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      height: 792 * scale,
      width: 612 * scale
    })),
    renderPage: vi.fn((_options?: Record<string, unknown>) => ({ cancel: cancelRender, promise: Promise.resolve() })),
    GlobalWorkerOptions: {
      workerSrc: ""
    }
  };
});

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
    expect(screen.getByRole("img", { name: "Reading Surface page 2" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Reading Surface page 3" })).toBeInTheDocument();
    expect(screen.queryByTitle("Reading Surface")).not.toBeInTheDocument();
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
    expect(pdfjsMock.renderPage).toHaveBeenCalledWith(
      expect.objectContaining({
        background: "#d9dab6",
        canvasContext
      })
    );
    expect(pdfjsMock.renderPage).toHaveBeenCalledWith(expect.not.objectContaining({ pageColors: expect.anything() }));
    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
    expect(screen.getByText("quiet-reading.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace local PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit to width" })).toBeInTheDocument();
  });

  it("avoids the PDF.js page color filter that can crash cancelled renders", async () => {
    const user = userEvent.setup();

    pdfjsMock.renderPage.mockImplementationOnce(options => {
      if (options && "pageColors" in options) {
        throw new DOMException("CanvasRenderingContext2D.drawImage: Passed-in canvas is empty", "InvalidStateError");
      }

      return { cancel: pdfjsMock.cancelRender, promise: Promise.resolve() };
    });

    render(<Page />);

    await user.upload(screen.getByLabelText("Open local PDF"), pdfFile);

    expect(await screen.findByText("3 pages ready.")).toBeInTheDocument();
    expect(screen.queryByText("This PDF could not be rendered.")).not.toBeInTheDocument();
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

  it("keeps PDF.js cancellation from ending on an empty canvas", async () => {
    const user = userEvent.setup();
    let finishRender: () => void = () => {};
    const pendingRender = new Promise<void>(resolve => {
      finishRender = resolve;
    });

    pdfjsMock.renderPage.mockReturnValueOnce({
      cancel: pdfjsMock.cancelRender,
      promise: pendingRender
    });

    render(<Page />);

    await user.upload(screen.getByLabelText("Open local PDF"), pdfFile);
    const canvas = await screen.findByRole("img", { name: "Reading Surface page 1" });
    await waitFor(() => expect(pdfjsMock.renderPage).toHaveBeenCalled());

    Object.defineProperty(canvas, "width", {
      configurable: true,
      value: 0,
      writable: true
    });
    Object.defineProperty(canvas, "height", {
      configurable: true,
      value: 0,
      writable: true
    });
    pdfjsMock.cancelRender.mockImplementationOnce(() => {
      expect(canvas).toHaveProperty("width", 1);
      expect(canvas).toHaveProperty("height", 1);
    });

    await user.click(screen.getByRole("button", { name: "Close local PDF" }));

    expect(pdfjsMock.cancelRender).toHaveBeenCalled();
    expect(screen.queryByText("This PDF could not be rendered.")).not.toBeInTheDocument();
    finishRender();
  });

  it("ignores invalid remembered zoom that would blank the Reading Surface", async () => {
    const user = userEvent.setup();
    const memoryKey = `pdf-reader:file-memory:${pdfFile.name}:${pdfFile.size}:${pdfFile.lastModified}`;

    localStorage.setItem(
      memoryKey,
      JSON.stringify({
        fingerprint: {
          name: pdfFile.name,
          size: pdfFile.size,
          lastModified: pdfFile.lastModified
        },
        lastPage: 1,
        zoom: "fit-to-width"
      })
    );

    render(<Page />);

    await user.upload(screen.getByLabelText("Open local PDF"), pdfFile);

    expect(await screen.findByText("3 pages ready.")).toBeInTheDocument();
    expect(screen.getByText("Fit")).toBeInTheDocument();
    expect(screen.queryByText("NaN%")).not.toBeInTheDocument();
    expect(pdfjsMock.getViewport).toHaveBeenCalledWith({ scale: expect.any(Number) });
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
