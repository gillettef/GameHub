---
name: check-rule
description: Look up a specific Eleven board game rule in notes/Eleven_Rulebook.md and answer with an exact page citation. Use before implementing or changing any game-logic behavior whenever you're not 100% sure what the rulebook says.
context: fork
agent: rules-checker
background: false
arguments: [question]
disable-model-invocation: false
---

Answer the following rules question about the Eleven board game, using
`notes/Eleven_Rulebook.md` as the sole source of truth (double-check against
`notes/Eleven_Rulebook_KOR.pdf` only if the markdown transcription looks ambiguous
or incomplete for this question):

$question

Cite the `<!-- p.NN -->` page marker(s) the answer comes from. If the rulebook doesn't
cover this (e.g. it's about specific card content rather than a game procedure), say so
explicitly and note it falls under the Mock 데이터 정책 in CLAUDE.md instead.
