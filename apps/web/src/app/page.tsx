"use client";

import { Button } from "@repo/ui/components/button";
import { ChevronLeft, ChevronRight, FileUp, Minus, Plus, RotateCcw, X } from "lucide-react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/pdf";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";

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
  background: "#101411",
  foreground: "#f5f2e9"
};

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

const getLocalPdfFingerprint = (file: File): LocalPdfFingerprint => ({
  name: file.name,
  size: file.size,
  lastModified: file.lastModified
});

const getFileMemoryKey = (fingerprint: LocalPdfFingerprint) =>
  `${fileMemoryPrefix}:${fingerprint.name}:${fingerprint.size}:${fingerprint.lastModified}`;

const readFileMemory = (fingerprint: LocalPdfFingerprint): FileMemory | null => {
  const storedMemory = localStorage.getItem(getFileMemoryKey(fingerprint));

  if (!storedMemory) {
    return null;
  }

  try {
    return JSON.parse(storedMemory) as FileMemory;
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

const clampPage = (page: number, pageCount: number) => Math.min(Math.max(page, 1), pageCount);

const clampZoom = (zoom: number) => Math.min(Math.max(zoom, minimumZoom), maximumZoom);

const getNumericZoom = (zoom: ReaderZoom) => (zoom === "fit-width" ? defaultZoom : zoom);

const cancelRenderTask = (renderTask: RenderTask | null) => {
  try {
    renderTask?.cancel();
  } catch {
    return;
  }
};

export default function ReadingWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readingSurfaceRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [localPdf, setLocalPdf] = useState<LocalPdf | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState<ReaderZoom>("fit-width");
  const [status, setStatus] = useState("No Local PDF selected.");

  useEffect(() => {
    return () => {
      cancelRenderTask(renderTaskRef.current);
      void localPdf?.document.destroy();
    };
  }, [localPdf]);

  useEffect(() => {
    if (!localPdf || pageCount === 0) {
      return;
    }

    const canvas = canvasRef.current;
    const readingSurface = readingSurfaceRef.current;
    const canvasContext = canvas?.getContext("2d");

    if (!canvas || !canvasContext || !readingSurface) {
      return;
    }

    let isCancelled = false;

    const renderCurrentPage = async () => {
      setStatus(`Rendering page ${currentPage} of ${pageCount}.`);
      cancelRenderTask(renderTaskRef.current);

      const page = await localPdf.document.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, readingSurface.clientWidth - 64);
      const renderZoom = zoom === "fit-width" ? clampZoom(availableWidth / baseViewport.width) : zoom;
      const viewport = page.getViewport({ scale: renderZoom });
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const renderTask = page.render({
        background: comfortPageColors.background,
        canvasContext,
        pageColors: comfortPageColors,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        viewport
      });

      renderTaskRef.current = renderTask;
      await renderTask.promise;

      if (isCancelled) {
        return;
      }

      renderTaskRef.current = null;
      rememberFileMemory({
        fingerprint: localPdf.fingerprint,
        lastPage: currentPage,
        zoom
      });
      setStatus(`Page ${currentPage} of ${pageCount} ready.`);
    };

    void renderCurrentPage().catch(error => {
      if (!isCancelled && error instanceof Error && error.name !== "RenderingCancelledException") {
        setStatus("This PDF could not be rendered.");
      }
    });

    return () => {
      isCancelled = true;
      cancelRenderTask(renderTaskRef.current);
    };
  }, [currentPage, localPdf, pageCount, zoom]);

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
    setZoom(memory?.zoom ?? "fit-width");
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
    cancelRenderTask(renderTaskRef.current);
    renderTaskRef.current = null;
    setLocalPdf(null);
    setPageCount(0);
    setCurrentPage(1);
    setZoom("fit-width");
    setStatus("No Local PDF selected.");
  };

  const goToPreviousPage = () => {
    setCurrentPage(page => Math.max(1, page - 1));
  };

  const goToNextPage = () => {
    setCurrentPage(page => Math.min(pageCount, page + 1));
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
            <div className={styles.fileState}>
              <span className={styles.fileName}>{localPdf.fingerprint.name}</span>
              <span className={styles.fileMeta}>{Math.max(1, Math.round(localPdf.fingerprint.size / 1024))} KB</span>
            </div>
            <div className={styles.pageControls} role="group" aria-label="Reader Controls">
              <Button
                className={styles.iconButton}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={currentPage === 1}
                onClick={goToPreviousPage}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <span className={styles.pageCount}>
                Page {currentPage} of {pageCount}
              </span>
              <Button
                className={styles.iconButton}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={currentPage === pageCount}
                onClick={goToNextPage}
              >
                <ChevronRight aria-hidden />
              </Button>
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
            <div className={styles.actions}>
              <Button className={styles.controlButton} type="button" variant="ghost" onClick={openFilePicker}>
                <RotateCcw aria-hidden />
                Replace local PDF
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

          <div ref={readingSurfaceRef} className={styles.readingSurface} role="region" aria-label="Reading Surface">
            <canvas
              ref={canvasRef}
              className={styles.pdfPage}
              role="img"
              aria-label={`Reading Surface page ${currentPage}`}
            />
            <p className={styles.status} aria-live="polite">
              {status}
            </p>
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
