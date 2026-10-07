FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    EXECUTION_MODE=demo \
    DATA_DIR=/app/.gleave \
    WORKSPACE_ROOT=/app/workspaces

WORKDIR /app

COPY pyproject.toml README.md ./
COPY app ./app

RUN pip install --no-cache-dir --upgrade pip setuptools \
    && pip install --no-cache-dir --no-build-isolation . \
    && useradd --create-home --uid 10001 ossbuilder \
    && mkdir -p /app/.gleave /app/workspaces \
    && chown -R ossbuilder:ossbuilder /app

USER ossbuilder

EXPOSE 8000

VOLUME ["/app/.gleave", "/app/workspaces"]

CMD ["gleave", "--host", "0.0.0.0", "--port", "8000"]
