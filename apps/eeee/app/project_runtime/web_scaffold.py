from __future__ import annotations

import json
from pathlib import Path


def create_web_app_scaffold(workspace: str | Path, project_name: str) -> list[Path]:
    """Create a credential-free full-stack web project boundary."""

    root = Path(workspace)
    files = {
        "README.md": f"""# {project_name}

Gleave가 생성한 배포 준비형 웹앱 프로젝트입니다. 로컬 demo auth로 즉시 실행할 수 있으며, production OAuth와 데이터베이스는 환경변수 설정 후 연결합니다.

## 로컬 실행

```bash
python apps/api/server.py
```

브라우저에서 `http://127.0.0.1:8787`을 엽니다.

## 구조

- `apps/web`: FSD 기반 프론트엔드
- `apps/api`: 로컬 API와 저장소 경계
- `packages/auth`: demo/production 인증 계약
- `packages/db`: SQLite/production DB 교체 지점
- `DEPLOYMENT.md`: 배포 전 설정과 검증 절차
""",
        ".env.example": """# Local mode is safe without provider credentials.
APP_ENV=local
API_HOST=127.0.0.1
API_PORT=8787
DATABASE_URL=sqlite:///./data/app.sqlite3
AUTH_MODE=demo
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SESSION_SECRET=replace-in-production
PUBLIC_APP_URL=http://127.0.0.1:8787
""",
        ".gitignore": """.env
data/
__pycache__/
*.py[cod]
""",
        "Dockerfile": """FROM python:3.12-slim

WORKDIR /app
COPY . .
EXPOSE 8787
ENV API_HOST=0.0.0.0 API_PORT=8787 AUTH_MODE=demo
CMD ["python", "apps/api/server.py"]
""",
        "docker-compose.yml": """services:
  app:
    build: .
    ports:
      - "8787:8787"
    env_file: .env
    volumes:
      - app-data:/app/data
volumes:
  app-data:
""",
        "DEPLOYMENT.md": f"""# {project_name} 배포 체크리스트

## 현재 상태

- 로컬 demo auth: 즉시 사용 가능
- 로컬 API와 SQLite 경계: 구현 대상
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 설정 전까지 `awaiting_configuration`
- 공개 배포: 호스팅 연결 전까지 배포하지 않음

## 배포 전

1. `AUTH_MODE=production`과 OAuth callback URL을 설정합니다.
2. `SESSION_SECRET`을 새 값으로 설정하고 저장소에 커밋하지 않습니다.
3. production `DATABASE_URL`을 설정합니다.
4. `python -m pytest`와 브라우저 E2E를 실행합니다.
5. ClaimLatch release gate가 같은 project/revision에 대해 PASS인지 확인합니다.

EEEE는 외부 credential이 설정되지 않은 상태를 배포 완료로 보고하지 않습니다.
""",
        "apps/web/index.html": """<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gleave Web App</title>
    <link rel="stylesheet" href="./src/shared/ui/styles.css" />
  </head>
  <body><main id="app"></main><script type="module" src="./src/app/main.js"></script></body>
</html>
""",
        "apps/web/src/app/main.js": """import { renderApp } from '../pages/home/ui.js';

renderApp(document.querySelector('#app'));
""",
        "apps/web/src/entities/todo/model.js": """export function normalizeTodo(todo) {
  return { id: String(todo.id), title: String(todo.title), completed: Boolean(todo.completed), priority: todo.priority || 'medium' };
}
""",
        "apps/web/src/shared/lib/api.js": """const API_BASE = window.GLEAVE_API_BASE || '';

export async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json();
}
""",
        "apps/web/src/pages/home/ui.js": """import { request } from '../../shared/lib/api.js';

export function renderApp(root) {
  root.innerHTML = `<section class="app-shell"><header><span class="logo">G</span><div><small>Gleave workspace</small><h1>나의 작업</h1></div><button id="login">Google로 로그인</button></header><div id="auth-status" class="notice">로컬 demo 모드로 준비 중...</div><form id="todo-form"><input id="todo-title" required placeholder="새 작업을 입력하세요" aria-label="새 작업"><select id="todo-priority" aria-label="우선순위"><option value="medium">보통</option><option value="high">높음</option><option value="low">낮음</option></select><button>추가</button></form><ul id="todo-list" aria-live="polite"></ul></section>`;
  const list = root.querySelector('#todo-list'); const status = root.querySelector('#auth-status'); const form = root.querySelector('#todo-form');
  const paint = (todos) => { list.replaceChildren(); todos.forEach((todo) => { const item = document.createElement('li'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = todo.completed; checkbox.setAttribute('aria-label', `${todo.title} 완료`); checkbox.addEventListener('change', () => request(`/api/todos/${todo.id}`, { method: 'PATCH', body: JSON.stringify({ completed: checkbox.checked }) }).then(load)); const text = document.createElement('span'); text.textContent = todo.title; if (todo.completed) text.className = 'done'; item.append(checkbox, text); list.append(item); }); };
  const load = () => request('/api/session').then((session) => { status.textContent = `${session.mode === 'demo' ? 'Demo 로그인' : 'Google 로그인'} · ${session.user.email}`; return request('/api/todos'); }).then(paint).catch((error) => { status.textContent = `연결 대기 중: ${error.message}`; });
  root.querySelector('#login').addEventListener('click', () => request('/api/session', { method: 'POST', body: JSON.stringify({ mode: 'demo' }) }).then(load));
  form.addEventListener('submit', (event) => { event.preventDefault(); const title = root.querySelector('#todo-title'); const priority = root.querySelector('#todo-priority'); request('/api/todos', { method: 'POST', body: JSON.stringify({ title: title.value, priority: priority.value }) }).then(() => { title.value = ''; load(); }); });
  load();
}
""",
        "apps/web/src/shared/ui/styles.css": """:root { font-family: Inter, Pretendard, system-ui, sans-serif; color: #172033; background: #f5f7fb; } * { box-sizing: border-box; } body { margin: 0; min-width: 320px; } .app-shell { width: min(920px, calc(100% - 32px)); margin: 48px auto; padding: 32px; border: 1px solid #e4e8f0; border-radius: 24px; background: #fff; box-shadow: 0 18px 55px #25304a12; } header { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; } header small { color: #7d8799; } h1 { margin: 5px 0 0; font-size: 34px; letter-spacing: -.06em; } .logo { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 14px; color: white; background: #172033; font-weight: 800; font-size: 22px; } header #login { margin-left: auto; border: 0; border-radius: 10px; padding: 11px 14px; color: #172033; background: #e9ebff; cursor: pointer; } .notice { margin-bottom: 18px; padding: 12px 14px; border-radius: 10px; color: #407a58; background: #eaf8ef; font-size: 13px; } form { display: flex; gap: 9px; margin-bottom: 20px; } input, select, form button { border: 1px solid #dfe4ee; border-radius: 10px; padding: 13px; font: inherit; } form input { flex: 1; min-width: 0; } form button { border: 0; color: white; background: #172033; cursor: pointer; } ul { display: grid; gap: 10px; padding: 0; list-style: none; } li { display: flex; align-items: center; gap: 12px; padding: 15px; border: 1px solid #e4e8f0; border-radius: 13px; } li input { accent-color: #69c996; } .done { color: #929bad; text-decoration: line-through; } @media (max-width: 560px) { .app-shell { margin: 16px auto; padding: 20px; } header { align-items: flex-start; flex-wrap: wrap; } header #login { margin-left: 56px; } form { flex-direction: column; } form button { min-height: 46px; } }
""",
        "apps/api/server.py": """from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from store import TodoStore

ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = ROOT / 'apps' / 'web'
store = TodoStore(Path(os.getenv('DATABASE_PATH', ROOT / 'data' / 'app.sqlite3')))
session = None


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload, content_type='application/json'):
        data = payload if isinstance(payload, bytes) else (json.dumps(payload, ensure_ascii=False).encode() if content_type == 'application/json' else payload.encode())
        self.send_response(status); self.send_header('content-type', f'{content_type}; charset=utf-8'); self.send_header('content-length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def _body(self):
        length = int(self.headers.get('content-length', 0)); return json.loads(self.rfile.read(length) or '{}')

    def do_GET(self):
        global session
        if self.path == '/api/health': return self._send(200, {'status': 'ok', 'auth': 'demo' if os.getenv('AUTH_MODE', 'demo') == 'demo' else 'awaiting_configuration'})
        if self.path == '/api/session': return self._send(200, session) if session else self._send(401, {'error': 'login_required'})
        if self.path == '/api/todos':
            if not session: return self._send(401, {'error': 'login_required'})
            return self._send(200, store.list())
        if self.path == '/' or self.path.startswith('/'):
            path = WEB_ROOT / ('index.html' if self.path == '/' else self.path.removeprefix('/'))
            if path.is_file(): return self._send(200, path.read_bytes(), 'text/html' if path.suffix == '.html' else 'text/javascript' if path.suffix == '.js' else 'text/css')
        return self._send(404, {'error': 'not_found'})

    def do_POST(self):
        global session
        if self.path == '/api/session':
            body = self._body(); mode = body.get('mode', 'demo')
            if mode == 'google' and not os.getenv('GOOGLE_CLIENT_ID'):
                return self._send(409, {'error': 'awaiting_configuration', 'reason': 'Google OAuth credentials are not configured'})
            session = {'mode': mode, 'user': {'email': 'local@example.test'}}; return self._send(200, session)
        if self.path == '/api/todos':
            if not session: return self._send(401, {'error': 'login_required'})
            return self._send(201, store.create(self._body()))
        return self._send(404, {'error': 'not_found'})

    def do_PATCH(self):
        if self.path.startswith('/api/todos/') and session:
            return self._send(200, store.update(self.path.rsplit('/', 1)[-1], self._body()))
        return self._send(401, {'error': 'login_required'})


if __name__ == '__main__':
    host = os.getenv('API_HOST', '127.0.0.1'); port = int(os.getenv('API_PORT', '8787'))
    ThreadingHTTPServer((host, port), Handler).serve_forever()
""",
        "apps/api/store.py": """from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path


class TodoStore:
    def __init__(self, path: Path):
        self.path = path; self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path) as db: db.execute('CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, title TEXT NOT NULL, priority TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0)')

    def list(self):
        with sqlite3.connect(self.path) as db: return [dict(id=row[0], title=row[1], priority=row[2], completed=bool(row[3])) for row in db.execute('SELECT id,title,priority,completed FROM todos ORDER BY rowid DESC')]

    def create(self, body):
        todo = {'id': uuid.uuid4().hex, 'title': str(body.get('title', '')).strip(), 'priority': body.get('priority', 'medium'), 'completed': False}
        if not todo['title']: raise ValueError('title_required')
        with sqlite3.connect(self.path) as db: db.execute('INSERT INTO todos VALUES (?,?,?,?)', (todo['id'], todo['title'], todo['priority'], 0))
        return todo

    def update(self, todo_id, body):
        with sqlite3.connect(self.path) as db: db.execute('UPDATE todos SET completed=? WHERE id=?', (int(bool(body.get('completed'))), todo_id))
        return next(item for item in self.list() if item['id'] == todo_id)
""",
        "packages/auth/README.md": """# Authentication contract

Local execution uses a clearly labeled demo session so the app can be tested without credentials. Production Google OAuth is not considered configured until `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, callback URL, and session secret exist. EEEE must report `awaiting_configuration` instead of claiming production login works.
""",
        "packages/db/README.md": """# Database contract

Local mode uses SQLite through `apps/api/store.py`. Production deployments replace `DATABASE_PATH` with a managed `DATABASE_URL` through a connector-specific adapter and must rerun migration and E2E checks.
""",
    }
    created: list[Path] = []
    for relative, content in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(content, encoding='utf-8', newline='\n')
            created.append(path)
    return created
