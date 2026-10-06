import httpx

from app.desktop.client import PetApiClient


def test_run_calls_task_run_endpoint(monkeypatch):
    requests = []

    def request(method, url, **kwargs):
        requests.append((method, url, kwargs))
        return httpx.Response(200, json={"state": "awaiting_approval"})

    monkeypatch.setattr(httpx, "request", request)

    result = PetApiClient("http://127.0.0.1:8123").run("task-1")

    assert result == {"state": "awaiting_approval"}
    assert requests == [
        (
            "POST",
            "http://127.0.0.1:8123/projects/default/tasks/task-1/run",
            {"timeout": 5.0},
        )
    ]
