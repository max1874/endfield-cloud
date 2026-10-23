# Floor plans from MaaEnd

Files here are copied unchanged from MaaEnd
(<https://github.com/MaaEnd/MaaEnd>, AGPL-3.0),
`assets/resource/image/MapLocator/`, at commit `ed63929a`. The images themselves
derive from the game's own data.

| File | MaaEnd path | Area |
|------|-------------|------|
| `omv_base01.png` | `MapLocator/OMVBase/OMVBase01.png` | 帝江号, the deck with 舰桥 and 中央环厅 |

Max decided on 2026-10-23 that this project is for personal use only and may use
MaaEnd's floor plans. If the project is ever distributed, these files bring the
AGPL with them: replace them with our own captures first or license the project
accordingly.

The engine bundles every PNG here with the templates (`build.rs`); a task loads one
by its file stem from `window.__engineTemplates`.
