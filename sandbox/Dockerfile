# Custom Python execution image for the self-hosted Code Interpreter sandbox.
#
# The code-interpreter service (ghcr.io/martvaha/code-interpreter) does NOT run
# user code in its own container — it spawns a sibling container per execution
# from the image named by PY_CONTAINER_IMAGE (default jupyter/scipy-notebook).
# So packages must be baked into THIS image, not the orchestrator image.
#
# scipy-notebook already ships numpy/pandas/matplotlib/scipy/pillow; we add the
# document/spreadsheet/PDF libraries it lacks so chart/xlsx/docx/pdf tasks
# succeed on the first attempt without a runtime `pip install`.
#
# Build + tag on the Docker host so sibling-container spawns can find it:
#   docker compose build sandbox-python
# then ensure the code-interpreter service has:
#   PY_CONTAINER_IMAGE=aiworkforce/py-sandbox:latest
FROM jupyter/scipy-notebook:latest

RUN pip install --no-cache-dir \
      openpyxl \
      xlsxwriter \
      python-docx \
      python-pptx \
      reportlab \
      fpdf2 \
      pillow \
      tabulate \
      pyyaml \
      requests \
 && python -c "import openpyxl, docx, pptx, reportlab, fpdf, PIL, matplotlib, pandas, numpy; print('sandbox packages OK')"
