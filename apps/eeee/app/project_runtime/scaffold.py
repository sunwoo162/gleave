from __future__ import annotations

import json
from pathlib import Path


def create_todo_scaffold(workspace: str | Path) -> list[Path]:
    """Create the deterministic, local-first Todo starter used by ISEOL release tasks."""

    root = Path(workspace)
    files = {
        "index.html": """<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Todo</title>
    <link rel="icon" href="favicon.svg" />
    <link rel="stylesheet" href="src/shared/ui/styles.css" />
  </head>
  <body>
    <main id="app" aria-labelledby="page-title"></main>
    <script type="module" src="src/app/main.js"></script>
  </body>
</html>
""",
        "package.json": json.dumps(
            {
                "name": "gleave-todo-project",
                "private": True,
                "version": "0.1.0",
                "scripts": {"start": "python -m http.server 4173"},
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "favicon.svg": """<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><rect width=\"64\" height=\"64\" rx=\"18\" fill=\"#1a1a1a\"/><path d=\"m17 33 10 10 20-22\" fill=\"none\" stroke=\"#fff\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"7\"/></svg>\n""",
        "README.md": """# Todo 프로젝트

Gleave와 ISEOL이 생성한 로컬 우선 Todo 프로젝트입니다.

## 실행

```bash
python -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 기능

- Todo 추가
- 완료 처리
- Todo 삭제
- 브라우저 새로고침 후에도 localStorage 유지
- 한국어 기본 UI와 반응형 레이아웃

## 구조

Feature-Sliced Design 원칙에 따라 `app`, `pages`, `widgets`, `features`, `entities`, `shared`로 구성합니다.
""",
        "DESIGN.md": """# Todo 프로젝트 디자인

기본 디자인 기준은 Stayfolio 스타일의 콘텐츠 우선, 넓은 여백, 근흑색 텍스트, 둥근 카드와 모바일 우선 반응형입니다.

- 기본 폰트: system sans-serif / Pretendard 사용 가능
- 기본 radius: 20px
- 기본 여백: 16px, 24px, 40px
- 모바일 기준 폭: 320px, 375px, 390px
- 사용자가 별도 디자인을 요청하면 이 기준보다 사용자 요구사항을 우선합니다.
""",
        "src/app/main.js": """import { renderTodoPage } from '../pages/todo-page/ui.js';

renderTodoPage(document.querySelector('#app'));
""",
        "src/entities/todo/model.js": """export function createTodo(title) {
  return { id: crypto.randomUUID(), title: title.trim(), completed: false };
}

export function toggleTodo(todo) {
  return { ...todo, completed: !todo.completed };
}
""",
        "src/shared/lib/storage.js": """const KEY = 'gleave-todo-items';

export function loadTodos() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

export function saveTodos(todos) { localStorage.setItem(KEY, JSON.stringify(todos)); }
""",
        "src/features/todo-create/ui.js": """import { createTodo } from '../../entities/todo/model.js';

export function createTodoFromInput(input) {
  const title = input.value.trim();
  if (!title) return null;
  input.value = '';
  return createTodo(title);
}
""",
        "src/features/todo-toggle/ui.js": """import { toggleTodo } from '../../entities/todo/model.js';

export function toggleTodoAt(todos, id) {
  return todos.map((todo) => todo.id === id ? toggleTodo(todo) : todo);
}
""",
        "src/widgets/todo-list/ui.js": """export function renderTodoList(list, todos, handlers) {
  list.replaceChildren();
  for (const todo of todos) {
    const item = document.createElement('li');
    item.className = todo.completed ? 'todo todo--done' : 'todo';
    item.innerHTML = `<label><input type="checkbox" data-toggle="${todo.id}" ${todo.completed ? 'checked' : ''}><span>${escapeHtml(todo.title)}</span></label><button type="button" data-delete="${todo.id}">삭제</button>`;
    list.append(item);
  }
  list.querySelectorAll('[data-toggle]').forEach((node) => node.addEventListener('change', () => handlers.toggle(node.dataset.toggle)));
  list.querySelectorAll('[data-delete]').forEach((node) => node.addEventListener('click', () => handlers.remove(node.dataset.delete)));
}

function escapeHtml(value) { return value.replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' }[char])); }
""",
        "src/pages/todo-page/ui.js": """import { createTodoFromInput } from '../../features/todo-create/ui.js';
import { toggleTodoAt } from '../../features/todo-toggle/ui.js';
import { loadTodos, saveTodos } from '../../shared/lib/storage.js';
import { renderTodoList } from '../../widgets/todo-list/ui.js';

export function renderTodoPage(root) {
  let todos = loadTodos();
  root.innerHTML = `<section class="page"><p class="eyebrow">Gleave project</p><h1 id="page-title">오늘의 Todo</h1><form id="todo-form"><label class="sr-only" for="todo-input">Todo 입력</label><input id="todo-input" placeholder="해야 할 일을 입력하세요" autocomplete="off"><button>추가</button></form><p id="empty" class="empty">아직 등록된 일이 없습니다.</p><ul id="todo-list" aria-live="polite"></ul></section>`;
  const form = root.querySelector('#todo-form');
  const input = root.querySelector('#todo-input');
  const list = root.querySelector('#todo-list');
  const empty = root.querySelector('#empty');
  const paint = () => { renderTodoList(list, todos, { toggle: (id) => { todos = toggleTodoAt(todos, id); saveTodos(todos); paint(); }, remove: (id) => { todos = todos.filter((todo) => todo.id !== id); saveTodos(todos); paint(); } }); empty.hidden = todos.length > 0; };
  form.addEventListener('submit', (event) => { event.preventDefault(); const todo = createTodoFromInput(input); if (todo) { todos = [todo, ...todos]; saveTodos(todos); paint(); } });
  paint();
}
""",
        "src/shared/ui/styles.css": """:root { color: #1a1a1a; background: #f7f6f2; font-family: Pretendard, system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
.page { width: min(720px, calc(100% - 32px)); margin: 64px auto; padding: 40px; background: #fff; border-radius: 20px; box-shadow: 0 18px 50px rgba(26,26,26,.08); }
.eyebrow { letter-spacing: .12em; text-transform: uppercase; color: #6b6b6b; }
h1 { font-size: clamp(2rem, 7vw, 4rem); margin: 0 0 32px; }
form { display: flex; gap: 12px; } input { min-width: 0; flex: 1; padding: 16px; border: 1px solid #d8d6cf; border-radius: 100px; font: inherit; } button { border: 0; border-radius: 100px; padding: 0 22px; background: #1a1a1a; color: white; font: inherit; cursor: pointer; }
ul { display: grid; gap: 12px; padding: 0; list-style: none; } .todo { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 16px; border: 1px solid #e5e2d9; border-radius: 16px; } .todo label { display: flex; gap: 12px; align-items: center; } .todo--done span { color: #888; text-decoration: line-through; } .todo button { background: transparent; color: #8b2f2f; padding: 4px 8px; }
.empty { color: #777; padding: 24px 0; } .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
@media (max-width: 560px) { .page { margin: 24px auto; padding: 24px; } form { flex-direction: column; } button { min-height: 48px; } }
""",
        "tests/e2e/todo-flow.md": """# Todo E2E 시나리오

1. 앱을 연다.
2. Todo를 추가한다.
3. 완료 처리한다.
4. 새로고침한다.
5. 완료 상태가 유지되는지 확인한다.
6. Todo를 삭제한다.
7. 320px, 390px, 768px, 1440px에서 레이아웃을 확인한다.
""",
    }
    created: list[Path] = []
    for relative, content in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(content, encoding="utf-8", newline="\n")
            created.append(path)
    return created
