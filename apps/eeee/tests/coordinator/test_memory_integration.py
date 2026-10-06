from app.coordinator.service import Coordinator
from app.storage.sqlite import SQLiteStore


def test_coordinator_initializes_memory_tables_on_the_shared_state_database(tmp_path) -> None:
    state_path = tmp_path / "state.sqlite3"
    store = SQLiteStore(state_path)
    store.init()

    coordinator = Coordinator(store)

    assert coordinator.memory.path == state_path
    with coordinator.memory._connect() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
    assert {"memory_records", "memory_events"}.issubset(tables)
