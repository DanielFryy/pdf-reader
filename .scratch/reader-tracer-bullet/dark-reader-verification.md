# Dark Reader Test Verification

## Renderer Candidate

Native browser PDF viewer through a local object URL.

## Automated Checks

- Route-level tests verify that Reader Mode starts from a quiet open/drop entry point.
- Route-level tests verify that file selection and drag-and-drop show the Reading Surface.
- Route-level tests verify that the current Local PDF can be reset.
- Route-level tests verify that File Memory stores local metadata, last-page, and zoom fields without storing PDF bytes.

## Manual Check

Status: pending in Zen/Firefox with Dark Reader enabled.

The required manual acceptance check is:

- The PDF page background no longer feels like a bright white sheet.
- PDF text remains readable.
- The surrounding app chrome stays quiet.

If the native object URL renderer fails this check, the next Renderer Candidate should be a TypeScript app integration around a PDF rendering library.
