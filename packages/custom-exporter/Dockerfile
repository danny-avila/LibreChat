FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY exporter.py .

# Unbuffered output for better logging in K8s
ENV PYTHONUNBUFFERED=1

CMD ["python", "exporter.py"]
