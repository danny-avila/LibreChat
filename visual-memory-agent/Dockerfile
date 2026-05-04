FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# We don't COPY . . here because volumes will override it at runtime
EXPOSE 8090 8091
# Default command (overridden by docker-compose.yml command)
CMD ["python", "mcp_server.py"]