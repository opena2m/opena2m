FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
ENV AIMP_GATEWAY_URL=http://gateway:8080 \
    AIMP_GATEWAY_TOKEN=dev-token \
    PYTHONUNBUFFERED=1
CMD ["python", "server.py"]
