from app.project_runtime.web_scaffold import create_web_app_scaffold


def test_web_app_scaffold_contains_full_stack_and_deployment_contract(tmp_path):
    root = tmp_path / "web-project"

    created = create_web_app_scaffold(root, "Todo Web")

    expected = [
        "apps/web/index.html",
        "apps/web/src/app/main.js",
        "apps/web/src/entities/todo/model.js",
        "apps/api/server.py",
        "apps/api/store.py",
        "packages/auth/README.md",
        "packages/db/README.md",
        "docker-compose.yml",
        "Dockerfile",
        ".env.example",
        "DEPLOYMENT.md",
        ".gitignore",
    ]
    assert all((root / path).is_file() for path in expected)
    assert len(created) >= len(expected)
    assert "Todo Web" in (root / "DEPLOYMENT.md").read_text(encoding="utf-8")


def test_web_app_scaffold_docker_compose_has_a_real_build_boundary(tmp_path):
    root = tmp_path / "web-project"
    create_web_app_scaffold(root, "Todo Web")

    dockerfile = (root / "Dockerfile").read_text(encoding="utf-8")
    compose = (root / "docker-compose.yml").read_text(encoding="utf-8")

    assert "FROM python:" in dockerfile
    assert "apps/api/server.py" in dockerfile
    assert "build: ." in compose


def test_web_app_scaffold_is_local_first_and_truthful_about_production_auth(tmp_path):
    root = tmp_path / "web-project"
    create_web_app_scaffold(root, "Todo Web")

    env = (root / ".env.example").read_text(encoding="utf-8")
    auth = (root / "packages/auth/README.md").read_text(encoding="utf-8")
    api = (root / "apps/api/server.py").read_text(encoding="utf-8")

    assert "GOOGLE_CLIENT_ID=" in env
    assert "demo" in auth.lower()
    assert "awaiting_configuration" in api


def test_web_app_scaffold_keeps_local_runtime_state_out_of_source_control(tmp_path):
    root = tmp_path / "web-project"
    create_web_app_scaffold(root, "Todo Web")

    gitignore = (root / ".gitignore").read_text(encoding="utf-8")

    assert "data/" in gitignore
    assert ".env" in gitignore
    assert "__pycache__/" in gitignore


def test_web_app_scaffold_contains_product_baseline_features(tmp_path):
    root = tmp_path / "web-project"
    create_web_app_scaffold(root, "Todo Web")

    page = (root / "apps/web/src/pages/home/ui.js").read_text(encoding="utf-8")
    api = (root / "apps/api/server.py").read_text(encoding="utf-8")
    store = (root / "apps/api/store.py").read_text(encoding="utf-8")

    for feature in ("검색", "필터", "수정", "삭제", "진행률", "마감일"):
        assert feature in page
    assert "/api/todos/stats" in api
    assert "def delete" in store
    assert "due_date" in store
