# Fonts

All faces are listed on Free Faces (https://www.freefaces.gallery/), are free under the
SIL Open Font License 1.1 (embedding and commercial use allowed), and are self-hosted here.

| Face | Role | Designer | Source | Licence | File |
|---|---|---|---|---|---|
| Karrik Regular | Display: titles, big numbers | Jean-Baptiste Morizot, Lucas Le Bihan (Velvetyne) | https://velvetyne.fr/fonts/karrik/ , https://www.freefaces.gallery/typefaces/karrik | OFL 1.1, `OFL-Karrik.txt` | `Karrik-Regular.woff2` |
| Space Grotesk (variable, wght 300-700) | Text, buttons and the wax seals' lettering (Bold) | Florian Karsten | https://github.com/floriankarsten/space-grotesk , https://www.freefaces.gallery/typefaces/space-grotesk | OFL 1.1, `OFL-SpaceGrotesk.txt` | `SpaceGrotesk-VF-latin.woff2` |
| Martian Mono (variable, wght 100-800, wdth 75-112.5) | Labels and data: collection numbers, record fields | Roman Shamin (Evil Martians) | https://github.com/evilmartians/mono (v1.1.0) , https://www.freefaces.gallery/typefaces/martian-mono | OFL 1.1, `OFL-MartianMono.txt` | `MartianMono-VF-latin.woff2` |

Space Grotesk and Martian Mono are subset to Latin with fontTools (`pyftsubset`). Martian Mono keeps
`kern`, `tnum`, `case`, `zero` and `ss01` and drops its coding ligatures, so "--" and "->" stay as typed.
