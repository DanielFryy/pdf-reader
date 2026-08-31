# Build Local-Only Reader Tracer Bullet

Labels: ready-for-agent

## Problem Statement

The current web app is still starter content, so it does not yet solve the user's actual problem: opening a PDF in a quiet browser workspace and reading it comfortably. The user wants a simple, serious personal Reading Workspace for reading PDFs and nothing else for now.

The central pain is eye comfort. In the user's main browser, Zen/Firefox, ordinary PDF reading can leave the PDF page as a bright white sheet even when the rest of the browser is comfortable. The first valuable slice is proving a Reading Surface that works with Dark Reader: the PDF should stop feeling painfully bright, the text should stay readable, and the surrounding app chrome should remain quiet.

The reader must also preserve a local privacy boundary. A Local PDF should stay in the current browser session, with no upload, sync, cloud library, or permanent storage of PDF bytes.

## Solution

Replace the starter web app route with a Reader Tracer Bullet: a minimal local-only Reader Mode where the user can open or drag-and-drop a Local PDF and read it in a clean Reading Surface.

The app should start almost blank, with a quiet drop target and an open-file action. Once a PDF is selected, the app should display it using the simplest Renderer Candidate that passes the Dark Reader Test in Zen/Firefox. The first Renderer Candidate should be the browser's native PDF viewer through a local object URL. If that fails the Dark Reader Test, the implementation should move to a TypeScript app integration around a PDF rendering library.

For v1, app chrome should stay smaller than Scribd's. The app should copy only the Dark Reader behavior the user values from Scribd, not Scribd's broader document controls or product surface. If the native PDF viewer already provides page, zoom, fit-to-width, and reading controls, the app should not duplicate them. Fullscreen can wait.

The app may store harmless File Memory metadata in the local browser, such as file name, size, last page, and zoom. It must not store PDF bytes.

## User Stories

1. As the primary user, I want to open the web app and see a quiet reading entry point, so that I can start reading without navigating a product dashboard.
2. As the primary user, I want to choose a PDF from my local files, so that I can read a document without uploading it anywhere.
3. As the primary user, I want to drag and drop a PDF into the app, so that opening a document feels fast and natural.
4. As the primary user, I want the app to accept a Local PDF in the current browser, so that the Reader Mode preserves my privacy by default.
5. As the primary user, I want the PDF bytes to remain unstored by the app, so that the reader does not become a hidden document library.
6. As the primary user, I want the app to display the selected PDF immediately after opening it, so that the first satisfying workflow is open and read.
7. As the primary user, I want the Reading Surface to be visually quiet, so that the PDF remains the focus.
8. As the primary user, I want the surrounding app chrome to stay minimal, so that the interface does not distract from reading.
9. As the primary user, I want the Reading Surface to work in Zen/Firefox, so that the app fits the browser I actually use.
10. As the primary user, I want the Reading Surface to work with Dark Reader in Zen/Firefox, so that the PDF page background no longer feels like a bright white sheet.
11. As the primary user, I want PDF text to remain readable after Dark Reader transforms the page, so that comfort does not come at the cost of legibility.
12. As the primary user, I want the app chrome to remain quiet after Dark Reader transforms the page, so that the reader still feels calm.
13. As the primary user, I want the implementation to try the browser's native PDF viewer first, so that the first version stays as simple as possible if it passes the Dark Reader Test.
14. As the primary user, I want the app to switch to a TypeScript integration around a PDF rendering library if the native viewer fails, so that Dark Reader compatibility wins over implementation minimalism.
15. As the primary user, I want the app to avoid building its own dark mode for v1, so that the feature tests the actual browser-extension workflow I care about.
16. As the primary user, I want the app to avoid duplicating native PDF controls when the embedded viewer already provides them, so that the first version stays uncluttered.
17. As the primary user, I want to see enough document state to know that my PDF has loaded, so that I can trust the app is ready for reading.
18. As the primary user, I want a reset or replace-document action, so that I can switch PDFs without refreshing the app.
19. As the primary user, I want the app to remember harmless File Memory metadata locally, so that reopening the same PDF can restore useful reading context.
20. As the primary user, I want File Memory to use local browser metadata such as file name and size, so that the app can recognize a document without storing the PDF itself.
21. As the primary user, I want last-page memory to be local to the current browser, so that the reader stays private and does not imply account sync.
22. As the primary user, I want zoom memory to be local to the current browser, so that repeat reading sessions can feel less repetitive.
23. As a future maintainer, I want the Reader Tracer Bullet to be scoped narrowly, so that later features do not accidentally sneak into the first build.
24. As a future maintainer, I want Reader Mode to remain a local-only product promise, so that future cloud or library features can be designed separately.
25. As a future maintainer, I want the Renderer Candidate choice to be treated as a decision point, so that the app can start simple but still move to a custom renderer when the Dark Reader Test demands it.
26. As a future maintainer, I want tests to cover user-visible route behavior rather than implementation details, so that renderer internals can change without rewriting the whole test suite.
27. As a future maintainer, I want manual verification notes for the Dark Reader Test, so that the most important success criterion is checked in the real browser environment.
28. As a future maintainer, I want fullscreen to stay out of the first slice, so that the first implementation focuses on open, display, read, and verify.
29. As a future maintainer, I want annotations, notes, thumbnails, search, AI, and document-library behavior to stay out of scope, so that the product remains a reading workspace rather than a knowledge workspace.
30. As a future public user, I want the architecture not to block a public app later, so that the serious personal tool can grow without undoing the Reader Mode privacy boundary.

## Implementation Decisions

- Replace the starter web app route with the Reader Tracer Bullet.
- The first screen should be almost blank: a quiet drop zone and an open-file action, with no marketing surface.
- The first accepted input paths are local file picker and drag-and-drop.
- Reader Mode is local-only. The app must not upload, sync, or permanently store PDF bytes.
- The first Renderer Candidate is the browser's native PDF viewer using a local object URL.
- If the native object URL renderer fails the Dark Reader Test in Zen/Firefox, the implementation should move to a TypeScript app integration around a PDF rendering library.
- The app should copy only Scribd's observed Dark Reader compatibility behavior, not Scribd's broader interface or controls.
- The surrounding app chrome should be neutral and low-contrast. Do not add a strong native app dark mode in this slice.
- If the embedded/native viewer provides page, zoom, fit-to-width, and related controls, the app should not duplicate them for v1.
- If a custom renderer is needed, add only the smallest Reader Controls required for reading: current page/page count, zoom, fit-to-width, and a way to open or replace the Local PDF.
- Fullscreen is not part of the first build unless it falls out of the native viewer for free and does not add app complexity.
- File Memory may store harmless local metadata, such as file name, file size, last page, and zoom.
- File Memory must not store PDF bytes.
- Last-page and zoom memory should be scoped to the current browser rather than an account or backend.
- The app remains TypeScript-first. Any external PDF renderer is a library choice, not a change to the project's implementation language.

## Testing Decisions

- Tests should exercise external user-visible behavior, not renderer implementation details.
- The highest automated test seam is the web app route: render the route, interact with the empty state, simulate choosing or dropping a Local PDF, and verify that the Reading Surface appears.
- Route-level tests should cover the empty state being quiet and focused on open/drop behavior.
- Route-level tests should cover replacing or resetting the current Local PDF.
- Route-level tests should cover that local metadata can be persisted without storing PDF bytes, if File Memory is implemented in this slice.
- Existing route tests using React Testing Library and Vitest are the prior art for this feature.
- Browser APIs that are awkward in the test environment, such as object URL creation and file selection/drop behavior, should be mocked at the route seam.
- Automated tests should not attempt to prove Dark Reader compatibility. That behavior depends on Zen/Firefox and the browser extension.
- The Dark Reader Test is a manual verification requirement: in Zen/Firefox with Dark Reader enabled, the PDF page background should no longer feel like a bright white sheet, PDF text should remain readable, and app chrome should stay quiet.
- If manual verification fails for the native object URL Renderer Candidate, the implementation should record that result and move to the next Renderer Candidate rather than expanding unrelated features.

## Out of Scope

- Search.
- Annotations.
- Highlights.
- Notes.
- AI reading assistance.
- Summaries or knowledge extraction.
- Thumbnails.
- Sidebar navigation.
- Document library behavior.
- Accounts.
- Uploads.
- Sync.
- Cloud storage.
- Permanent PDF-byte storage.
- Native app dark mode.
- Fullscreen, unless supplied by the native viewer without extra app work.
- Public launch polish.
- Mobile-first optimization beyond avoiding broken layout.

## Further Notes

The key product phrase is: reading and nothing else for now.

The implementation should stay serious enough for future public growth, but the first value is personal: the user opens a PDF, reads it in Zen/Firefox, and confirms that Dark Reader makes the Reading Surface easier on the eyes.

The most important risk is renderer choice. The native object URL approach is intentionally first because it is simple, but it should not be defended if it fails the Dark Reader Test. Dark Reader compatibility beats implementation tiny-ness for this tracer bullet.
