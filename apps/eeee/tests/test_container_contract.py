from pathlib import Path


def test_dockerfile_has_non_root_demo_runtime():
    dockerfile = Path("Dockerfile").read_text(encoding="utf-8")

    assert "FROM python:3.12-slim" in dockerfile
    assert "USER ossbuilder" in dockerfile
    assert "EXPOSE 8000" in dockerfile
    assert 'CMD ["oss-product-builder", "--host", "0.0.0.0", "--port", "8000"]' in dockerfile
    assert "COPY .env" not in dockerfile
    assert "pip install" in dockerfile


def test_compose_declares_demo_mode_and_persistent_mounts():
    compose = Path("docker-compose.yml").read_text(encoding="utf-8")

    assert "EXECUTION_MODE: demo" in compose
    assert "8000:8000" in compose
    assert "data:/app/.oss-builder" in compose
    assert "workspaces:/app/workspaces" in compose
    assert "oss-product-builder:local" in compose


def test_compose_uses_named_data_volume_for_non_root_writes():
    compose = Path("docker-compose.yml").read_text(encoding="utf-8")

    assert "data:/app/.oss-builder" in compose
    assert "data:" in compose
