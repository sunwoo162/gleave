from pathlib import Path

from app.integrations.claimlatch_process import ClaimLatchProcessManager


class FakeProcess:
    def __init__(self) -> None:
        self.pid = 4318
        self.terminated = False

    def poll(self):
        return None

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=0):
        return 0


def test_manager_starts_bundled_claimlatch_plugin_with_inherited_credentials(monkeypatch, tmp_path) -> None:
    spawned = {}
    process = FakeProcess()

    def fake_popen(command, **kwargs):
        spawned["command"] = command
        spawned["kwargs"] = kwargs
        return process

    monkeypatch.setattr("app.integrations.claimlatch_process.subprocess.Popen", fake_popen)
    monkeypatch.setattr("app.integrations.claimlatch_process.socket.create_connection", lambda *args, **kwargs: FakeSocket())
    manager = ClaimLatchProcessManager(
        repo_root=tmp_path,
        port=4318,
        llm_model="test-model",
        llm_api_key="test-key",
        llm_base_url="http://llm.local/v1",
        tavily_api_key="tavily-key",
    )

    result = manager.start()

    assert result.url == "http://127.0.0.1:4318"
    assert result.started is True
    assert spawned["command"][-3:] == ["--", "--port", "4318"]
    assert spawned["kwargs"]["env"]["CLAIMLATCH_LLM_MODEL"] == "test-model"
    assert spawned["kwargs"]["env"]["TAVILY_API_KEY"] == "tavily-key"
    manager.stop()
    assert process.terminated is True


def test_manager_starts_local_claimlatch_without_provider_configuration(monkeypatch, tmp_path) -> None:
    process = FakeProcess()
    monkeypatch.setattr("app.integrations.claimlatch_process.subprocess.Popen", lambda *args, **kwargs: process)
    monkeypatch.setattr("app.integrations.claimlatch_process.socket.create_connection", lambda *args, **kwargs: FakeSocket())
    manager = ClaimLatchProcessManager(repo_root=Path(tmp_path))

    result = manager.start()

    assert result.started is True
    assert result.url == "http://127.0.0.1:4318"


class FakeSocket:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False
