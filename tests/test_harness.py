import json
import tempfile
import unittest
from pathlib import Path

from harness import LearnerMemory, WorkflowEngine, WorkflowError


class WorkflowEngineTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.workflow_dir = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def write_workflow(self, workflow):
        (self.workflow_dir / "test.json").write_text(json.dumps(workflow), encoding="utf-8")

    def test_runs_nodes_and_routes_by_context(self):
        self.write_workflow({
            "start": "first",
            "nodes": [
                {"id": "first", "type": "set", "next": "branch"},
                {"id": "branch", "type": "route", "route_on": "route", "next": {"yes": "last", "default": "other"}},
                {"id": "last", "type": "finish", "next": None},
                {"id": "other", "type": "other", "next": None},
            ],
        })
        calls = []

        def action(name, updates=None):
            def execute(context, _node):
                calls.append(name)
                context.update(updates or {})
                return {}
            return execute

        engine = WorkflowEngine(self.workflow_dir, {
            "set": action("set", {"route": "yes"}),
            "route": action("route"),
            "finish": action("finish"),
            "other": action("other"),
        })
        engine.run("test", {})
        self.assertEqual(calls, ["set", "route", "finish"])

    def test_rejects_workflow_paths(self):
        engine = WorkflowEngine(self.workflow_dir, {})
        with self.assertRaises(WorkflowError):
            engine.run("../outside", {})


class LearnerMemoryTests(unittest.TestCase):
    def test_practice_survives_reopening_database(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "learning.sqlite3"
            memory = LearnerMemory(database)
            entry = memory.add_practice({
                "language": "fr",
                "source": "Bonjour",
                "recognized": "Bon jour",
                "missed": ["Bonjour"],
                "words": 2,
                "at": 123,
            })

            reopened = LearnerMemory(database)
            self.assertEqual(reopened.history(), [entry])
            self.assertIn("Nicht erkannt: Bonjour", reopened.context("fr"))


if __name__ == "__main__":
    unittest.main()