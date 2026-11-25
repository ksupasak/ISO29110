# Directive files

One file per work product: `WPnn.md`. A directive tells the skill what the document needs, section by section, and what to ask when the recording did not cover it. Add a WP by adding a file; no code changes.

## Format

```markdown
---
wp: WP07
name: Meeting Record (บันทึกการประชุม)
template: <path from the repository root to the template docx>
output: "{projectCode}_MR-{docNo}.docx"
use_when: one line — which kind of recording this WP fits
---

## Not from audio
Fields that a recording never settles (document number, version, signatures). Each line: field — ask the user | leave as in template.

## Sections

### <n>. <heading exactly as in the template>
- where: how to find the spot in the docx (heading text, table label, row label)
- needs: what information belongs here
- required: yes | no
- form: paragraph | bullets | table(<column>, <column>, …) | fields(<label>, <label>, …) | choice(<option>, …)
- hints: phrases that usually introduce this content in speech
- ask: the follow-up question, in Thai, addressed to a person who was in the meeting
```

## Rules for writing one

- Sections follow the template's order and use its heading text, so the skill can find the place in the docx.
- `required: yes` only for sections an assessor expects filled in. A required section with no information produces a question; an optional one stays out of the questions list.
- `ask` must be answerable in one or two sentences by a named kind of person (PM, customer, developer).
- Templates carry sample text in square brackets `[...]`. That text is an example of the form, never content. Say so in `where` when a section contains samples that look like real data.
