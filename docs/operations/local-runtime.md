# Local runtime

EEEE is the local entrypoint. It starts a FastAPI coordinator bound to `127.0.0.1`, stores project state and durable memory in one SQLite database, and can launch the PySide6 desktop companion without a login or hosted control plane.

From the repository root:

```powershell
python -m pip install -e ".\apps\eeee[desktop]"
.\scripts\dev-up.ps1
```

The widget is always-on-top, draggable, interactive, and can hide to or restore from the system tray. It talks only to the local EEEE API. Discord and mobile clients are planned adapters, not required runtime dependencies.

Run the focused local verification:

```powershell
.\scripts\verify-all.ps1
```

Use `-Full` for the complete EEEE Python suite. The ClaimLatch adapter is a loopback/process boundary and must remain fail-closed: a transport error, malformed report, missing evidence, or blocked ClaimLatch decision cannot become a released answer or memory candidate.
