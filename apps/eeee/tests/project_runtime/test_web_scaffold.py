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
        ".env.example",
        "DEPLOYMENT.md",
    ]
    assert all((root / path).is_file() for path in expected)
    assert len(created) >= len(expected)
    assert "Todo Web" in (root / "DEPLOYMENT.md").read_text(encoding="utf-8")


def test_web_app_scaffold_is_local_first_and_truthful_about_production_auth(tmp_path):
    root = tmp_path / "web-project"
    create_web_app_scaffold(root, "Todo Web")

    env = (root / ".env.example").read_text(encoding="utf-8")
    auth = (root / "packages/auth/README.md").read_text(encoding="utf-8")
    api = (root / "apps/api/server.py").read_text(encoding="utf-8")

    assert "GOOGLE_CLIENT_ID=" in env
    assert "demo" in auth.lower()
    assert "awaiting_configuration" in api
