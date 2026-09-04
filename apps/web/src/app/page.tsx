"use client";

import { Button } from "@repo/ui/components/button";
import { ChevronDown, FileUp, Maximize, Minus, Plus, RotateCcw, X } from "lucide-react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/pdf";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ReaderZoom = number | "fit-width";

type LocalPdfFingerprint = {
  name: string;
  size: number;
  lastModified: number;
};

type FileMemory = {
  fingerprint: LocalPdfFingerprint;
  lastPage: number;
  zoom: ReaderZoom;
};

type LocalPdfFileHandle = {
  getFile: () => Promise<File>;
  kind?: string;
  name?: string;
  queryPermission?: (descriptor?: { mode: "read" }) => Promise<PermissionState>;
};

type FilePickerWindow = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: Array<{
        accept: Record<string, string[]>;
        description: string;
      }>;
    }) => Promise<LocalPdfFileHandle[]>;
  };

type DataTransferItemWithHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<LocalPdfFileHandle | null>;
};

type LocalPdf = {
  document: PDFDocumentProxy;
  fingerprint: LocalPdfFingerprint;
};

const defaultZoom = 1;
const minimumZoom = 0.5;
const maximumZoom = 2.5;
const zoomStep = 0.15;
const fileMemoryPrefix = "pdf-reader:file-memory";
const currentLocalPdfHandleDatabaseName = "pdf-reader-current-local-pdf";
const currentLocalPdfHandleStoreName = "handles";
const currentLocalPdfHandleId = "current";
const comfortPageColors = {
  background: "#d9dab6"
};

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

const getLocalPdfFingerprint = (file: File): LocalPdfFingerprint => ({
  name: file.name,
  size: file.size,
  lastModified: file.lastModified
});

const getFileMemoryKey = (fingerprint: LocalPdfFingerprint) =>
  `${fileMemoryPrefix}:${fingerprint.name}:${fingerprint.size}:${fingerprint.lastModified}`;

const clampPage = (page: number, pageCount: number) => Math.min(Math.max(page, 1), pageCount);

const clampZoom = (zoom: number) => Math.min(Math.max(zoom, minimumZoom), maximumZoom);

const getFitWidthZoom = (availableWidth: number, pageWidth: number) =>
  Math.max(minimumZoom, availableWidth / Math.max(1, pageWidth));

const normalizeReaderZoom = (zoom: unknown): ReaderZoom => {
  if (zoom === "fit-width") {
    return zoom;
  }

  if (typeof zoom === "number" && Number.isFinite(zoom)) {
    return clampZoom(zoom);
  }

  return "fit-width";
};

const readFileMemory = (fingerprint: LocalPdfFingerprint): FileMemory | null => {
  const storedMemory = localStorage.getItem(getFileMemoryKey(fingerprint));

  if (!storedMemory) {
    return null;
  }

  try {
    const memory = JSON.parse(storedMemory) as Partial<FileMemory>;

    return {
      fingerprint,
      lastPage: typeof memory.lastPage === "number" && Number.isFinite(memory.lastPage) ? memory.lastPage : 1,
      zoom: normalizeReaderZoom(memory.zoom)
    };
  } catch {
    return null;
  }
};

const rememberFileMemory = (memory: FileMemory) => {
  localStorage.setItem(getFileMemoryKey(memory.fingerprint), JSON.stringify(memory));
};

const openCurrentLocalPdfHandleDatabase = () =>
  new Promise<IDBDatabase | null>(resolve => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    const request = indexedDB.open(currentLocalPdfHandleDatabaseName, 1);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(currentLocalPdfHandleStoreName)) {
        database.createObjectStore(currentLocalPdfHandleStoreName);
      }
    });
    request.addEventListener("error", () => resolve(null));
    request.addEventListener("success", () => resolve(request.result));
  });

const readCurrentLocalPdfHandle = async () => {
  const database = await openCurrentLocalPdfHandleDatabase();

  if (!database) {
    return null;
  }

  return new Promise<LocalPdfFileHandle | null>(resolve => {
    const transaction = database.transaction(currentLocalPdfHandleStoreName, "readonly");
    const request = transaction.objectStore(currentLocalPdfHandleStoreName).get(currentLocalPdfHandleId);

    request.addEventListener("error", () => resolve(null));
    request.addEventListener("success", () => resolve((request.result as LocalPdfFileHandle | undefined) ?? null));
    transaction.addEventListener("complete", () => database.close());
    transaction.addEventListener("abort", () => database.close());
  });
};

const rememberCurrentLocalPdfHandle = async (handle: LocalPdfFileHandle) => {
  const database = await openCurrentLocalPdfHandleDatabase();

  if (!database) {
    return;
  }

  await new Promise<void>(resolve => {
    const transaction = database.transaction(currentLocalPdfHandleStoreName, "readwrite");

    transaction.objectStore(currentLocalPdfHandleStoreName).put(handle, currentLocalPdfHandleId);
    transaction.addEventListener("complete", () => {
      database.close();
      resolve();
    });
    transaction.addEventListener("abort", () => {
      database.close();
      resolve();
    });
    transaction.addEventListener("error", () => {
      database.close();
      resolve();
    });
  });
};

const forgetCurrentLocalPdfHandle = async () => {
  const database = await openCurrentLocalPdfHandleDatabase();

  if (!database) {
    return;
  }

  await new Promise<void>(resolve => {
    const transaction = database.transaction(currentLocalPdfHandleStoreName, "readwrite");

    transaction.objectStore(currentLocalPdfHandleStoreName).delete(currentLocalPdfHandleId);
    transaction.addEventListener("complete", () => {
      database.close();
      resolve();
    });
    transaction.addEventListener("abort", () => {
      database.close();
      resolve();
    });
    transaction.addEventListener("error", () => {
      database.close();
      resolve();
    });
  });
};

const canReadCurrentLocalPdfHandle = async (handle: LocalPdfFileHandle) => {
  try {
    const permission = await handle.queryPermission?.({ mode: "read" });

    return !permission || permission === "granted";
  } catch {
    return false;
  }
};

const pickLocalPdfFile = async () => {
  const filePickerWindow = window as FilePickerWindow;
  const [handle] =
    (await filePickerWindow.showOpenFilePicker?.({
      multiple: false,
      types: [
        {
          description: "PDF",
          accept: {
            "application/pdf": [".pdf"]
          }
        }
      ]
    })) ?? [];

  if (!handle) {
    return null;
  }

  return {
    file: await handle.getFile(),
    handle
  };
};

const getDroppedLocalPdfHandle = async (event: DragEvent<HTMLDivElement>) => {
  const [item] = Array.from(event.dataTransfer.items ?? []) as DataTransferItemWithHandle[];
  const handle = await item?.getAsFileSystemHandle?.();

  return handle?.kind === "file" ? handle : null;
};

const readLocalPdfBytes = (file: File) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("error", () => reject(new Error("Unable to read the selected PDF.")));
    reader.addEventListener("load", () => resolve(new Uint8Array(reader.result as ArrayBuffer)));
    reader.readAsArrayBuffer(file);
  });

const getNumericZoom = (zoom: ReaderZoom) => (typeof zoom === "number" && Number.isFinite(zoom) ? zoom : defaultZoom);

const getNonEmptyCanvasSize = (size: number) => (Number.isFinite(size) ? Math.max(1, Math.floor(size)) : 1);

const keepCanvasDrawable = (canvas: HTMLCanvasElement | null | undefined) => {
  if (!canvas) {
    return;
  }

  if (canvas.width === 0) {
    canvas.width = 1;
  }

  if (canvas.height === 0) {
    canvas.height = 1;
  }
};

const cancelRenderTasks = (renderTasks: RenderTask[], canvases: Iterable<HTMLCanvasElement>) => {
  Array.from(canvases).forEach(keepCanvasDrawable);

  renderTasks.forEach(renderTask => {
    try {
      renderTask.cancel();
    } catch {
      return;
    }
  });
};

export default function ReadingWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const readingSurfaceRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const renderTasksRef = useRef<RenderTask[]>([]);
  const restoredPageRef = useRef<number | null>(null);
  const [localPdf, setLocalPdf] = useState<LocalPdf | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState("1");
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState<ReaderZoom>("fit-width");
  const [status, setStatus] = useState("No Local PDF selected.");
  const pageNumbers = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount]);

  const cancelActiveRenders = useCallback(() => {
    cancelRenderTasks(renderTasksRef.current, canvasRefs.current.values());
    renderTasksRef.current = [];
  }, []);

  const setPageCanvasRef = useCallback(
    (pageNumber: number) => (canvas: HTMLCanvasElement | null) => {
      if (canvas) {
        canvasRefs.current.set(pageNumber, canvas);
      } else {
        canvasRefs.current.delete(pageNumber);
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      cancelActiveRenders();
      void localPdf?.document.destroy();
    };
  }, [cancelActiveRenders, localPdf]);

  useEffect(() => {
    if (!localPdf || pageCount === 0) {
      return;
    }

    const readingSurface = readingSurfaceRef.current;

    if (!readingSurface) {
      return;
    }

    let isCancelled = false;

    const renderPages = async () => {
      setStatus(`Rendering ${pageCount} pages.`);
      cancelActiveRenders();

      for (const pageNumber of pageNumbers) {
        if (isCancelled) {
          return;
        }

        const canvas = canvasRefs.current.get(pageNumber);
        const canvasContext = canvas?.getContext("2d");

        if (!canvas || !canvasContext) {
          continue;
        }

        const page = await localPdf.document.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(320, readingSurface.clientWidth);
        const renderZoom = zoom === "fit-width" ? getFitWidthZoom(availableWidth, baseViewport.width) : zoom;
        const viewport = page.getViewport({ scale: renderZoom });
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = getNonEmptyCanvasSize(viewport.width * outputScale);
        canvas.height = getNonEmptyCanvasSize(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const renderTask = page.render({
          background: comfortPageColors.background,
          canvasContext,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
          viewport
        });

        renderTasksRef.current = [...renderTasksRef.current, renderTask];
        await renderTask.promise;
        renderTasksRef.current = renderTasksRef.current.filter(task => task !== renderTask);

        if (isCancelled) {
          return;
        }

        if (restoredPageRef.current === pageNumber) {
          canvas.scrollIntoView?.({ block: "start" });
          restoredPageRef.current = null;
        }
      }

      setStatus(`${pageCount} pages ready.`);
    };

    void renderPages().catch(error => {
      if (!isCancelled && error instanceof Error && error.name !== "RenderingCancelledException") {
        setStatus("This PDF could not be rendered.");
      }
    });

    return () => {
      isCancelled = true;
      cancelActiveRenders();
    };
  }, [cancelActiveRenders, localPdf, pageCount, pageNumbers, zoom]);

  useEffect(() => {
    if (!localPdf) {
      return;
    }

    rememberFileMemory({
      fingerprint: localPdf.fingerprint,
      lastPage: currentPage,
      zoom
    });
  }, [currentPage, localPdf, zoom]);

  useEffect(() => {
    setPageInputValue(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    const readingSurface = readingSurfaceRef.current;

    if (!readingSurface || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        const visiblePage = entries
          .filter(entry => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]?.target;
        const pageNumber = Number((visiblePage as HTMLElement | undefined)?.dataset.pageNumber);

        if (Number.isFinite(pageNumber)) {
          setCurrentPage(pageNumber);
        }
      },
      {
        root: readingSurface,
        threshold: [0.35, 0.55, 0.75]
      }
    );

    canvasRefs.current.forEach(canvas => observer.observe(canvas));

    return () => {
      observer.disconnect();
    };
  }, [localPdf, pageCount]);

  const openLocalPdf = useCallback(async (file: File, handle?: LocalPdfFileHandle | null) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Choose a PDF file.");
      return;
    }

    setStatus("Opening Local PDF.");
    await (handle ? rememberCurrentLocalPdfHandle(handle) : forgetCurrentLocalPdfHandle());

    const fingerprint = getLocalPdfFingerprint(file);
    const memory = readFileMemory(fingerprint);
    const bytes = await readLocalPdfBytes(file);
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const document = await loadingTask.promise;
    const restoredPage = clampPage(memory?.lastPage ?? 1, document.numPages);

    setLocalPdf({
      document,
      fingerprint
    });
    setPageCount(document.numPages);
    setCurrentPage(restoredPage);
    setZoom(normalizeReaderZoom(memory?.zoom));
    restoredPageRef.current = restoredPage;
  }, []);

  const openFilePicker = async () => {
    if ("showOpenFilePicker" in window) {
      try {
        const selection = await pickLocalPdfFile();

        if (selection) {
          await openLocalPdf(selection.file, selection.handle);
        }

        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setStatus("Choose a PDF file.");
        return;
      }
    }

    inputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);

    if (file) {
      void openLocalPdf(file, null);
    }

    event.target.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const [file] = Array.from(event.dataTransfer.files);

    if (file) {
      void getDroppedLocalPdfHandle(event).then(handle => openLocalPdf(file, handle));
    }
  };

  const closeLocalPdf = () => {
    cancelActiveRenders();
    canvasRefs.current.clear();
    restoredPageRef.current = null;
    setLocalPdf(null);
    setPageCount(0);
    setCurrentPage(1);
    setZoom("fit-width");
    setStatus("No Local PDF selected.");
    void forgetCurrentLocalPdfHandle();
  };

  const zoomOut = () => {
    setZoom(currentZoom => clampZoom(getNumericZoom(currentZoom) - zoomStep));
  };

  const zoomIn = () => {
    setZoom(currentZoom => clampZoom(getNumericZoom(currentZoom) + zoomStep));
  };

  const fitToWidth = () => {
    setZoom("fit-width");
  };

  const goToPage = (requestedPage: number) => {
    const nextPage = clampPage(Math.trunc(requestedPage), pageCount);
    const pageCanvas = canvasRefs.current.get(nextPage);

    setCurrentPage(nextPage);
    setPageInputValue(String(nextPage));
    pageCanvas?.scrollIntoView?.({ block: "start" });
  };

  const submitPageInput = () => {
    const requestedPage = Number(pageInputValue);

    if (pageInputValue.trim() === "" || !Number.isFinite(requestedPage)) {
      setPageInputValue(String(currentPage));
      return;
    }

    goToPage(requestedPage);
  };

  useEffect(() => {
    let isCancelled = false;

    const reopenCurrentLocalPdf = async () => {
      const handle = await readCurrentLocalPdfHandle();

      if (!handle || !(await canReadCurrentLocalPdfHandle(handle))) {
        return;
      }

      const file = await handle.getFile();

      if (!isCancelled) {
        await openLocalPdf(file, handle);
      }
    };

    void reopenCurrentLocalPdf().catch(() => {
      if (!isCancelled) {
        setStatus("Choose a PDF file.");
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [openLocalPdf]);

  return (
    <main
      className="h-[100svh] overflow-hidden bg-[#151918] text-[#e5e1cf] [font-synthesis:none]"
      aria-label="Reading Workspace"
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Open local PDF"
        onChange={handleFileChange}
      />

      {localPdf ? (
        <section className="grid h-[100svh] min-h-0 grid-rows-[auto_minmax(0,1fr)]" aria-label="Reader Mode">
          <div className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-[#303530] bg-[#292c02] px-4 py-2 max-[820px]:grid-cols-[1fr_auto] max-[820px]:gap-2 max-[820px]:px-3">
            <div className="flex flex-none items-center justify-end">
              <Button
                className="h-10 rounded-r-none border-0 bg-[#058342] px-3 py-0 font-bold leading-none text-white shadow-none hover:bg-[#07964d] hover:text-white"
                type="button"
                variant="ghost"
                onClick={() => void openFilePicker()}
              >
                <RotateCcw className="size-4" aria-hidden />
                Replace local PDF
              </Button>
              <Button
                className="h-10 w-9 rounded-l-none border-0 border-l border-white/20 bg-[#058342] p-0 text-white shadow-none hover:bg-[#07964d] hover:text-white"
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open menu"
              >
                <ChevronDown className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="flex min-w-0 items-baseline gap-2 max-[820px]:col-span-full max-[820px]:row-start-2">
              <span className="max-w-[min(40vw,640px)] overflow-hidden text-ellipsis whitespace-nowrap text-[0.95rem] font-semibold max-[820px]:max-w-full">
                {localPdf.fingerprint.name}
              </span>
              <span className="flex-none text-[0.82rem] text-[#aaa690]">
                {Math.max(1, Math.round(localPdf.fingerprint.size / 1024))} KB
              </span>
            </div>
            <div
              className="flex items-center gap-2 justify-self-end max-[820px]:col-span-full max-[820px]:row-start-3 max-[820px]:justify-self-start"
              role="group"
              aria-label="Reader Controls"
            >
              <form
                className="flex items-center gap-1 whitespace-nowrap text-center text-[0.82rem] tabular-nums text-[#d7d3c2]"
                aria-label="Current page"
                onSubmit={event => {
                  event.preventDefault();
                  submitPageInput();
                }}
              >
                <label className="sr-only" htmlFor="current-page-input">
                  Page {currentPage} of {pageCount}
                </label>
                <input
                  id="current-page-input"
                  className="h-8 w-12 rounded-md border border-[#5d5a66] bg-[#27252e] px-2 text-center text-[0.86rem] font-bold text-white outline-none [appearance:textfield] focus:border-[#d7d3c2] focus:ring-2 focus:ring-[#d7d3c2]/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={pageCount}
                  value={pageInputValue}
                  aria-label={`Current page, ${currentPage} of ${pageCount}`}
                  onBlur={submitPageInput}
                  onChange={event => setPageInputValue(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitPageInput();
                    }
                  }}
                />
                <span aria-hidden className="text-[#d1cdbb]">
                  / {pageCount}
                </span>
              </form>
              <Button
                className="h-9 w-9 border border-transparent bg-transparent p-0 text-[#d8d4c5] shadow-none hover:bg-white/10 hover:text-[#d8d4c5]"
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Zoom out"
                onClick={zoomOut}
              >
                <Minus className="size-4" aria-hidden />
              </Button>
              <span className="min-w-14 whitespace-nowrap text-center text-[0.82rem] tabular-nums text-[#d7d3c2]">
                {zoom === "fit-width" ? "Fit" : `${Math.round(zoom * 100)}%`}
              </span>
              <Button
                className="h-9 w-9 border border-transparent bg-transparent p-0 text-[#d8d4c5] shadow-none hover:bg-white/10 hover:text-[#d8d4c5]"
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Zoom in"
                onClick={zoomIn}
              >
                <Plus className="size-4" aria-hidden />
              </Button>
              <Button
                className="h-9 border border-transparent bg-transparent px-3 py-0 text-[0.82rem] text-[#d8d4c5] shadow-none hover:bg-white/10 hover:text-[#d8d4c5]"
                type="button"
                variant="ghost"
                onClick={fitToWidth}
              >
                Fit to width
              </Button>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                className="h-9 w-9 border border-transparent bg-transparent p-0 text-[#d8d4c5] shadow-none hover:bg-white/10 hover:text-[#d8d4c5]"
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fullscreen"
                onClick={() => readingSurfaceRef.current?.requestFullscreen?.()}
              >
                <Maximize className="size-4" aria-hidden />
              </Button>
              <Button
                className="h-9 w-9 border border-transparent bg-transparent p-0 text-[#d8d4c5] shadow-none hover:bg-white/10 hover:text-[#d8d4c5]"
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close local PDF"
                onClick={closeLocalPdf}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="min-h-0">
            <div
              ref={readingSurfaceRef}
              className="grid h-full min-h-0 w-full content-start justify-items-center gap-3 overflow-auto bg-[#151918] px-0 pb-8 pt-0"
              role="region"
              aria-label="Reading Surface"
            >
              <div className="grid w-full justify-items-center gap-4">
                {pageNumbers.map(pageNumber => (
                  <div key={pageNumber} className="max-w-full overflow-hidden bg-[#d9dab6]">
                    <canvas
                      ref={setPageCanvasRef(pageNumber)}
                      className="block max-w-full bg-[#d9dab6] [mix-blend-mode:multiply]"
                      data-page-number={pageNumber}
                      role="img"
                      aria-label={`Reading Surface page ${pageNumber}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[0.82rem] text-[#aaa690]" aria-live="polite">
                {status}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section
          className={`grid min-h-[100svh] place-items-center content-center gap-5 border border-dashed p-8 transition-colors ${
            isDragging ? "border-[#6f897b] bg-[#20241b]" : "border-transparent bg-[#151918]"
          }`}
          aria-label="Reader Mode"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="grid h-13 w-13 place-items-center rounded-lg border border-[#cbd6c8] text-[#d6d2bd]">
            <FileUp className="size-5" aria-hidden />
          </div>
          <h1 className="text-[clamp(1.5rem,3vw,2.4rem)] leading-tight font-medium tracking-normal">Drop a PDF here</h1>
          <Button
            className="border border-transparent bg-transparent text-[#d8d4c5] shadow-none hover:bg-white/10 hover:text-[#d8d4c5]"
            type="button"
            aria-label="Choose a local PDF"
            onClick={() => void openFilePicker()}
          >
            <FileUp className="size-4" aria-hidden />
            Open local PDF
          </Button>
        </section>
      )}
    </main>
  );
}
