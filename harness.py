import json
import os
import re
import sqlite3
import time
from pathlib import Path


class WorkflowError(Exception):
    pass


class WorkflowEngine:
    def __init__(self, workflow_dir, actions, max_steps=64):
        self.workflow_dir = Path(workflow_dir)
        self.actions = actions
        self.max_steps = max_steps

    def list_workflows(self):
        workflows = []
        for path in sorted(self.workflow_dir.glob("*.json")):
            workflow = json.loads(path.read_text(encoding="utf-8"))
            workflows.append({
                "id": path.stem,
                "name": workflow.get("name", path.stem),
                "description": workflow.get("description", ""),
            })
        return workflows

    def run(self, workflow_id, context):
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", workflow_id):
            raise WorkflowError("Ungültige Workflow-ID.")
        path = self.workflow_dir / f"{workflow_id}.json"
        if not path.is_file():
            raise WorkflowError(f"Workflow '{workflow_id}' wurde nicht gefunden.")
        workflow = json.loads(path.read_text(encoding="utf-8"))
        nodes = {node["id"]: node for node in workflow.get("nodes", [])}
        if len(nodes) != len(workflow.get("nodes", [])):
            raise WorkflowError("Workflow enthält doppelte Node-IDs.")
        current = workflow.get("start")
        if current not in nodes:
            raise WorkflowError("Workflow-Startknoten fehlt.")

        for _ in range(self.max_steps):
            node = nodes[current]
            action = self.actions.get(node.get("type"))
            if action is None:
                raise WorkflowError(f"Unbekannter Aktionstyp: {node.get('type')}")
            result = action(context, node) or {}
            if not isinstance(result, dict):
                raise WorkflowError(f"Aktion '{node['id']}' muss ein Objekt liefern.")
            context.update(result)

            next_node = node.get("next")
            if isinstance(next_node, dict):
                route = str(context.get(node.get("route_on", "route"), ""))
                next_node = next_node.get(route, next_node.get("default"))
            if next_node is None:
                return context
            if next_node not in nodes:
                raise WorkflowError(f"Folgeknoten '{next_node}' wurde nicht gefunden.")
            current = next_node

        raise WorkflowError(f"Workflow überschreitet das Limit von {self.max_steps} Schritten.")


def default_data_dir():
    configured = os.environ.get("PARLONS_DATA_DIR")
    if configured:
        return Path(configured).expanduser()
    if os.name == "nt":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    else:
        root = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    return root / "parlons"


class LearnerMemory:
    def __init__(self, database_path=None):
        self.database_path = Path(database_path or default_data_dir() / "learning.sqlite3")
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS practice (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    language TEXT NOT NULL,
                    source TEXT NOT NULL,
                    recognized TEXT NOT NULL,
                    missed TEXT NOT NULL,
                    words INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)

    def connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def add_practice(self, entry):
        created_at = int(entry.get("at", time.time()))
        with self.connect() as connection:
            cursor = connection.execute(
                "INSERT INTO practice (language, source, recognized, missed, words, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    entry["language"],
                    entry.get("source", ""),
                    entry["recognized"],
                    json.dumps(entry.get("missed", []), ensure_ascii=False),
                    int(entry.get("words", 0)),
                    created_at,
                ),
            )
            row = connection.execute("SELECT * FROM practice WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return self.serialize(row)

    def history(self, limit=100):
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM practice ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self.serialize(row) for row in reversed(rows)]

    def context(self, language, limit=8):
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT source, recognized, missed FROM practice WHERE language = ? ORDER BY id DESC LIMIT ?",
                (language, limit),
            ).fetchall()
        if not rows:
            return "Noch keine gespeicherten Übungen."
        return "\n".join(
            f"Geübt: \"{row['source']}\". Erkannt: \"{row['recognized']}\". Nicht erkannt: {', '.join(json.loads(row['missed'])) or 'keine'}."
            for row in reversed(rows)
        )

    @staticmethod
    def serialize(row):
        return {
            "language": row["language"],
            "source": row["source"],
            "recognized": row["recognized"],
            "missed": json.loads(row["missed"]),
            "words": row["words"],
            "at": row["created_at"],
        }