"use client";

import { Button } from "@repo/ui/components/button";
import { FileUp, RotateCcw, X } from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";

import styles from "./page.module.css";

type LocalPdf = {
  fingerprint: LocalPdfFingerprint;
  objectUrl: string;
};

type LocalPdfFingerprint = {
  name: string;
  size: number;
  lastModified: number;
};

type FileMemory = {
  fingerprint: LocalPdfFingerprint;
  lastPage: number;
  zoom: "native";
};

const fileMemoryPrefix = "pdf-reader:file-memory";

const getLocalPdfFingerprint = (file: File): LocalPdfFingerprint => ({
  name: file.name,
  size: file.size,
  lastModified: file.lastModified
});

const getFileMemoryKey = (fingerprint: LocalPdfFingerprint) =>
  `${fileMemoryPrefix}:${fingerprint.name}:${fingerprint.size}:${fingerprint.lastModified}`;

const rememberFileMetadata = (fingerprint: LocalPdfFingerprint) => {
  const memory: FileMemory = {
    fingerprint,
    lastPage: 1,
    zoom: "native"
  };

  localStorage.setItem(getFileMemoryKey(fingerprint), JSON.stringify(memory));
};

export default function ReadingWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const [localPdf, setLocalPdf] = useState<LocalPdf | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
      }
    };
  }, []);

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const openLocalPdf = (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const fingerprint = getLocalPdfFingerprint(file);

    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
    }

    currentObjectUrlRef.current = objectUrl;

    setLocalPdf({
      fingerprint,
      objectUrl
    });

    rememberFileMetadata(fingerprint);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);

    if (file) {
      openLocalPdf(file);
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
      openLocalPdf(file);
    }
  };

  const closeLocalPdf = () => {
    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }

    setLocalPdf(null);
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

          <iframe className={styles.readingSurface} src={localPdf.objectUrl} title="Reading Surface" />
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
