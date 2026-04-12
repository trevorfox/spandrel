# Pipeline Design

External data pipelines pull from MCPs, scripts, and APIs, then write markdown files into the tree.

## Requirements
- Output: markdown files with valid frontmatter (name, description, author)
- Author field uses `/systems/pipeline-name` convention
- File watcher or git hook detects new/changed files and triggers recompilation
- Pipelines are themselves Things (e.g., `/systems/slack-digest-pipeline/`)

## Templates
- Pipeline templates live in `_pipelines/_templates/`
