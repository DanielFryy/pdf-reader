"use client";

import { Button } from "@repo/ui/components/button";
import { ChevronDown, FileUp, Maximize, Minus, Plus, RotateCcw, X } from "lucide-react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/pdf";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./page.module.css";

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

type LocalPdf = {
  document: PDFDocumentProxy;
  fingerprint: LocalPdfFingerprint;
};

const defaultZoom = 1;
const minimumZoom = 0.5;
const maximumZoom = 2.5;
const zoomStep = 0.15;
const fileMemoryPrefix = "pdf-reader:file-memory";
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
        const availableWidth = Math.max(320, readingSurface.clientWidth - 64);
        const renderZoom = zoom === "fit-width" ? clampZoom(availableWidth / baseViewport.width) : zoom;
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

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const openLocalPdf = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Choose a PDF file.");
      return;
    }

    setStatus("Opening Local PDF.");

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
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);

    if (file) {
      void openLocalPdf(file);
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
      void openLocalPdf(file);
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

  return (
    <main className={styles.workspace} aria-label="Reading Workspace">
      <input
        ref={inputRef}
        className={styles.fileInput}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Open local PDF"
        onChange={handleFileChange}
      />

      {localPdf ? (
        <section className={styles.readerMode} aria-label="Reader Mode">
          <div className={styles.readerControls}>
            <div className={styles.actions}>
              <Button className={styles.openPrimaryButton} type="button" variant="ghost" onClick={openFilePicker}>
                <RotateCcw aria-hidden />
                Replace local PDF
              </Button>
              <Button
                className={styles.openMenuButton}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open menu"
              >
                <ChevronDown aria-hidden />
              </Button>
            </div>
            <div className={styles.fileState}>
              <span className={styles.fileName}>{localPdf.fingerprint.name}</span>
              <span className={styles.fileMeta}>{Math.max(1, Math.round(localPdf.fingerprint.size / 1024))} KB</span>
            </div>
            <div className={styles.topActions}>
              <Button
                className={styles.iconButton}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fullscreen"
                onClick={() => readingSurfaceRef.current?.requestFullscreen?.()}
              >
                <Maximize aria-hidden />
              </Button>
              <Button
                className={styles.iconButton}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close local PDF"
                onClick={closeLocalPdf}
              >
                <X aria-hidden />
              </Button>
            </div>
          </div>

          <div className={styles.readerBody}>
            <aside className={styles.sideRail} aria-label="Reader navigation">
              <div className={styles.pageControls} role="group" aria-label="Reader Controls">
                <span className={styles.pageCount}>
                  <span className={styles.screenReaderOnly}>
                    Page {currentPage} of {pageCount}
                  </span>
                  <strong>{currentPage}</strong>
                  <span>{pageCount}</span>
                </span>
                <Button
                  className={styles.iconButton}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Zoom out"
                  onClick={zoomOut}
                >
                  <Minus aria-hidden />
                </Button>
                <span className={styles.zoomState}>{zoom === "fit-width" ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
                <Button
                  className={styles.iconButton}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Zoom in"
                  onClick={zoomIn}
                >
                  <Plus aria-hidden />
                </Button>
                <Button className={styles.controlButton} type="button" variant="ghost" onClick={fitToWidth}>
                  Fit to width
                </Button>
              </div>
            </aside>

            <div ref={readingSurfaceRef} className={styles.readingSurface} role="region" aria-label="Reading Surface">
              <div className={styles.pdfPages}>
                {pageNumbers.map(pageNumber => (
                  <div key={pageNumber} className={styles.pageSheet}>
                    <canvas
                      ref={setPageCanvasRef(pageNumber)}
                      className={styles.pdfPage}
                      data-page-number={pageNumber}
                      role="img"
                      aria-label={`Reading Surface page ${pageNumber}`}
                    />
                  </div>
                ))}
              </div>
              <p className={styles.status} aria-live="polite">
                {status}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section
          className={`${styles.emptyState} ${isDragging ? styles.dragging : ""}`}
          aria-label="Reader Mode"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className={styles.dropGlyph}>
            <FileUp aria-hidden />
          </div>
          <h1>Drop a PDF here</h1>
          <Button className={styles.openButton} type="button" aria-label="Choose a local PDF" onClick={openFilePicker}>
            <FileUp aria-hidden />
            Open local PDF
          </Button>
        </section>
      )}
    </main>
  );
}
