from app.config import Settings
from app.main import create_app


def test_clean_core_starts_without_plugins_and_keeps_claimlatch_profile(tmp_path):
    app = create_app(Settings(data_dir=tmp_path / "data", workspace_root=tmp_path / "workspaces"))

    assert app.state.plugin_host.list() == []
    capability_ids = {item.id for item in app.state.assistant_service.router.registry.list()}
    assert {"personal-secretary", "project-execution", "knowledge-documents", "presence"} <= capability_ids
    assert app.state.trust_gate.profile_version == "claimlatch-v0.2.0"
    assert app.state.plugin_host is not None
