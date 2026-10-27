# Floor plans from MaaEnd

Files here are copied unchanged from MaaEnd
(<https://github.com/MaaEnd/MaaEnd>, AGPL-3.0),
`assets/resource/image/MapLocator/`, at commit `ed63929a`. The images themselves
derive from the game's own data.

| File | MaaEnd path | Area |
|------|-------------|------|
| `omv_base01.png` | `MapLocator/OMVBase/OMVBase01.png` | 帝江号, the deck with 舰桥 and 中央环厅 |

Max decided on 2026-10-23 that the project may use MaaEnd's floor plans; since
2026-10-27 the repository is public and licensed under AGPL-3.0 (`LICENSE`), the
same license as these files.

The engine bundles every PNG here with the templates (`build.rs`); a task loads one
by its file stem from `window.__engineTemplates`.
