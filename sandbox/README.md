# Code Interpreter sandbox image (`aiworkforce/py-sandbox`)

The self-hosted Code Interpreter (`ghcr.io/martvaha/code-interpreter`) does **not**
run user code in its own container. For each execution it spawns a **sibling
container** from the image named by the `PY_CONTAINER_IMAGE` env var. Python
packages must therefore live in **that** image (`sandbox/Dockerfile` →
`aiworkforce/py-sandbox:latest`), not in the orchestrator or the main API image.

`jupyter/scipy-notebook` (the base) already ships numpy/pandas/matplotlib/scipy.
This image adds the document/spreadsheet/PDF/chart libraries on top
(reportlab, fpdf2, pypdf, pdfplumber, pymupdf, openpyxl, xlsxwriter, python-docx,
python-pptx, plotly+kaleido, pillow, qrcode, lxml, beautifulsoup4, jinja2, …).

## If a package is "missing" at runtime

It almost always means the running code-interpreter is still spawning the
**stock** `jupyter/scipy-notebook` image (which has numpy/pandas/matplotlib but
not reportlab/docx/etc.) — i.e. the custom image was never built, or the
code-interpreter container wasn't recreated with `PY_CONTAINER_IMAGE` set.

The `sandbox-python` service sits behind the `build` profile, so a plain
`docker compose up` does **not** build it. You must build it explicitly and
recreate the interpreter:

```bash
# 1. Build the custom execution image on the Docker host
docker compose build sandbox-python

# 2. Recreate the code-interpreter so PY_CONTAINER_IMAGE takes effect
docker compose up -d --force-recreate code-interpreter

# 3. Verify the image has the libraries (the build also asserts this)
docker run --rm aiworkforce/py-sandbox:latest \
  python -c "import reportlab, docx, openpyxl, fitz, plotly; print('ok')"
```

The `RUN ... python -c "import ..."` line in `sandbox/Dockerfile` makes the
build **fail loudly** if any package didn't install, so a successfully built
image is guaranteed to contain every listed library.

## Adding more packages

Append to the `pip install` list in `sandbox/Dockerfile`, add the import to the
verification line, then rebuild (step 1) and recreate (step 2).
