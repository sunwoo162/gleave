# Gleave Desktop

The Desktop target is the local execution host for Gleave. It packages the EEEE
API, SQLite state, ClaimLatch adapter, ISEOL project runtime, and the desktop
widget from `apps/eeee/app/desktop`.

Desktop owns the source of truth and the local AI/tool permissions. It exposes
the paired Mobile bridge; it does not upload the EEEE database or require a
hosted login.

The aggregate repository keeps the implementation under `apps/eeee` so the
kernel and desktop distribution can be tested together. This directory is the
deployment boundary for a future standalone `gleave-desktop` repository.

The embedded runtime is started from `apps/eeee/app/desktop`. Desktop owns the
SQLite database, EEEE/ISEOL runtime, ClaimLatch adapter, and Mobile bridge. A
packaged desktop shell should launch the API on loopback, expose the widget,
and pass only the loopback URL plus the pairing-code action to Mobile.
