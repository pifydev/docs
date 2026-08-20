## Translation PR Checklist

- [ ] Source chapter present in `zh/src/`
- [ ] Translation covers all headings from source (parity verified by `sync-check.ps1`)
- [ ] Glossary terms preserved (see `GLOSSARY.md`)
- [ ] Code blocks identical across zh/en/vi (line count + content)
- [ ] Mermaid blocks render (validated by `validate-mermaid.ps1`)
- [ ] Frontmatter filled (`translator`, `terms_used`, `code_lines`, `code_blocks`, `mermaid_blocks`)
- [ ] `status` set correctly (`draft` -> `translated` -> `reviewed` -> `published`)
- [ ] Local sync-check passes: `pwsh scripts/sync-check.ps1`
- [ ] Local mdBook build passes: `pwsh scripts/build-all.ps1`
- [ ] Technical claims verified against [official Pi docs](https://pi.dev/docs/latest)
- [ ] No emojis, no fluff

## Reviewer Checklist

- [ ] Spot-checked 3 random paragraphs against the Chinese source
- [ ] Verified glossary terms are not translated
- [ ] Checked that the diff in `en/src/` matches the change in `vi/src/`
- [ ] Confirmed CI sync-check + build pass
