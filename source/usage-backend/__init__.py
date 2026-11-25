"""Backend companion for the Hermes Codex Visual desktop plugin."""

from . import assistant, activity


def register(ctx):
    # The tool only requests review. A person confirms the reset in Desktop.
    assistant.register(ctx)
    activity.register(ctx)
