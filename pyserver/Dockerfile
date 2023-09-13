FROM python:3.9

WORKDIR /app

COPY server.py .
COPY requirements.txt .

RUN pip install -r requirements.txt
RUN rm requirements.txt

CMD ["python", "server.py"]