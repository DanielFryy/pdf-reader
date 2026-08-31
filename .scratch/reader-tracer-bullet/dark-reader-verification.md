# Dark Reader Test Verification

## Renderer Candidate

Native browser PDF viewer through a local object URL: failed because Dark Reader did not affect the embedded PDF page.

PDF.js Reading Surface with comfort page colors: active candidate.

## Automated Checks

- Route-level tests verify that Reader Mode starts from a quiet open/drop entry point.
- Route-level tests verify that file selection and drag-and-drop show a PDF.js Reading Surface rather than an isolated native PDF iframe.
- Route-level tests verify that the current Local PDF can be replaced or reset.
- Route-level tests verify that File Memory stores local metadata, last-page, and zoom fields without storing PDF bytes.

## Browser Check

- A temporary Local PDF opened through the PDF.js Reading Surface at `http://localhost:3000`.
- The rendered route exposed Reader Controls, fit-to-width, replace, and close actions.
- The browser DOM showed one canvas Reading Surface page, no native PDF iframe, and a dark page background.
- No browser console errors were reported.

## Manual Check

Status: pending final pass in Zen/Firefox with Dark Reader enabled.

The required manual acceptance check is:

- The PDF page background no longer feels like a bright white sheet.
- PDF text remains readable.
- The surrounding app chrome stays quiet.

If the PDF.js Reading Surface fails this check, record the result before trying another Renderer Candidate.
