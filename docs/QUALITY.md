# Quality checks

Forge v1 uses the checks configured in [forge.toml](../forge.toml) when closing
a task or fix. The worker runs the repo test command before handoff. Forge
checks the result and review findings through `forge close <item>`. See
[AGENTS.md](../AGENTS.md) for the workflow.
