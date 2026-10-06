"""Small HTTP client used by the desktop shell."""

import httpx


class ApiError(RuntimeError):
    """The local coordinator returned an error response."""


class PetApiClient:
    def __init__(self, base_url: str = "http://127.0.0.1:8000", project_id: str = "default"):
        self.base_url = base_url.rstrip("/")
        self.project_id = project_id

    def _request(self, method: str, path: str, **kwargs) -> dict[str, object]:
        response = httpx.request(method, f"{self.base_url}{path}", timeout=5.0, **kwargs)
        if response.is_error:
            try:
                detail = response.json().get("detail", response.text)
            except ValueError:
                detail = response.text
            raise ApiError(str(detail))
        return response.json()

    def get_state(self) -> dict[str, object]:
        return self._request("GET", f"/projects/{self.project_id}/state")

    def create_request(self, text: str) -> dict[str, object]:
        return self._request(
            "POST",
            f"/projects/{self.project_id}/requests",
            json={"text": text},
        )

    def approve(self, request_id: str, selected: list[str]) -> dict[str, object]:
        return self._request(
            "POST",
            f"/projects/{self.project_id}/decisions/{request_id}/approve",
            json={"selected": selected},
        )

    def advance(self, task_id: str) -> dict[str, object]:
        return self._request(
            "POST", f"/projects/{self.project_id}/tasks/{task_id}/advance"
        )

    def run(self, task_id: str) -> dict[str, object]:
        return self._request(
            "POST", f"/projects/{self.project_id}/tasks/{task_id}/run"
        )

    def retry(self, task_id: str) -> dict[str, object]:
        return self._request(
            "POST", f"/projects/{self.project_id}/tasks/{task_id}/retry"
        )
