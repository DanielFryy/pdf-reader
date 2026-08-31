# Web App Context

This context covers the user-facing PDF reader app.

## Language

**Reading Workspace**:
A focused place for opening and reading PDFs. Its first purpose is comfortable reading, not note-taking, annotation, document management, or knowledge extraction.
_Avoid_: Knowledge workspace, annotation tool, research assistant

**Reading Surface**:
The clean interface where the PDF itself is read. It should stay visually quiet so browser-level reading aids such as dark-mode extensions can make the document easier on the eyes.
_Avoid_: Editor, dashboard, canvas

**Local PDF**:
A PDF opened from the user's current browser through a file picker or drag-and-drop. The first version does not upload, sync, or permanently store the PDF.
_Avoid_: Uploaded document, library item, cloud file

**Reader Controls**:
The small set of controls allowed around the reading surface: opening a local PDF, current page and page count, zoom, fit-to-width, and optional fullscreen.
_Avoid_: Toolbar, annotation tools, document manager

**Reader Mode**:
A local-only way to read a PDF in the current browser. This privacy boundary should remain a product promise even if future features add cloud storage or a document library elsewhere.
_Avoid_: Cloud reader, synced reading mode

**Dark Reader Compatibility**:
The reading surface should be transformable by Dark Reader in Zen/Firefox first. Native app theming is deferred until browser-extension compatibility proves insufficient.
_Avoid_: App dark mode, custom PDF theme

**Reader Tracer Bullet**:
The first useful slice of the app: open or drop a local PDF and read it in Zen/Firefox with Dark Reader compatibility. Fullscreen, search, annotation, thumbnails, notes, library features, and AI are outside this slice.
_Avoid_: MVP, full reader

**Renderer Candidate**:
A way to display a local PDF inside the reading surface. The first candidates are the browser's native PDF viewer through a local object URL, then a TypeScript app integration around a PDF rendering library if the native viewer fails the Dark Reader test.
_Avoid_: Renderer framework, permanent architecture

**Dark Reader Test**:
The acceptance check for the reader tracer bullet: in Zen/Firefox with Dark Reader enabled, the PDF page background no longer feels like a bright white sheet, text remains readable, and the surrounding app chrome stays quiet.
_Avoid_: Theme test, visual polish pass

**File Memory**:
Local browser metadata that remembers reading position and zoom for a local PDF without storing the PDF bytes. It may use harmless file facts such as name and size to recognize a document on the same browser.
_Avoid_: Document storage, sync, upload
