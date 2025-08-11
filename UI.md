## Design System UI (Premium Dark)

Questo documento definisce le regole di UI per lo sviluppo dell’app: palette colori, tipografia, bordi/stroke, stati interattivi, layout e componenti chiave. È il riferimento unico per garantire coerenza, look & feel “premium” e production-ready.

### Tipografia
- Font principale: Geist Mono (per tutto il testo dell’app, inclusi heading e body)
  - Fallback: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace
- Peso e tracking
  - Heading: font-semibold, tracking-tight
  - Body: regular/medium
- Rendering: antialiased su dark background

### Palette Colori (Hex)
- Background principale: 080A0F
- Bottoni e hover primario: 0B1E27
- Dettagli, stroke e superfici secondarie: 0C121A
- Testo/bianco: DDE3EB

Colori derivati usati in grafici e accenti
- Chart-1: 9CC7D8
- Chart-2: 7AA0B1
- Chart-3: 5E7C8A
- Chart-4: 3F5661
- Chart-5: 2B3C44

Mappatura variabili CSS (semantiche principali)
```css
--background: #080A0F;
--foreground: #DDE3EB;
--primary: #0B1E27;              /* bottoni, hover tinti */
--primary-foreground: #DDE3EB;   /* testo su primary */
--secondary: #0C121A;            /* superfici secondarie */
--secondary-foreground: #DDE3EB;
--muted: #0C121A;                /* blocchi attenuati */
--muted-foreground: #B6C0CB;     /* testo attenuato */
--accent: #0B1E27;               /* hover tints / accent */
--accent-foreground: #DDE3EB;
--border: #0C121A;               /* stroke principale */
--input: #0C121A;                /* fill input */
--ring: #0B1E27;                 /* focus ring */
```

### Bordi, Stroke, Raggi, Ombre
- Raggio standard: 12px (bordo morbido, coerente su card, contenuti e controlli)
- Stroke/Border: 1px, colore base `#0C121A` (opacità 0.9–1 per enfatizzare i contorni, 0.3–0.6 per separatori)
- Ombre: evitate o ridotte al minimo. Le superfici “premium” usano stroke leggere al posto di glow/ombre diffuse
- Divider tabelle e sezioni: bordo inferiore con `rgba(12, 18, 26, 0.9)` o versioni più soft quando serve

### Layout
- Struttura
  - Sidebar sinistra integrata con lo sfondo: usa lo stesso background del resto dell’app (nessun rettangolo/box distinto)
  - Area contenuti (a destra della sidebar): incorniciata da un riquadro premium
    - Margin: 0.5rem (ml: 0)
    - Padding interno: 0.75rem
    - Border: 1px solid rgba(12, 18, 26, 0.9)
    - Border radius: 12px
    - Nessuna ombra

### Componenti chiave
- Button
  - Default: bg `#0B1E27`, fg `#DDE3EB`
  - Hover: bg `#0B1E27` (accent), leggero lift (translateY -0.5px), niente glow
  - Outline: solo stroke `#0C121A` (no fill), hover con lieve tint `#0B1E27`
  - Focus: ring `#0B1E27` soft

- Input
  - Fill: `rgba(12,18,26,0.7)` su dark
  - Stroke: `#0C121A`
  - Focus: ring `#0B1E27` (soft), niente glow aggressivo

- Card
  - Background: gradiente leggerissimo su `#080A0F` (quasi impercettibile)
  - Stroke: `#0C121A` (1px)
  - Hover: micro-lift (-1px), nessuna ombra luminosa, border leggermente più marcato
  - Header/Footer: separatori sottili con versione attenuata del border

- Sidebar
  - Background identico a `--background` (`#080A0F`) per integrazione totale
  - Voci di menu
    - Hover: `rgba(11,30,39,0.9)` con testo `#DDE3EB`
    - Active: bg `#0B1E27`, fg `#DDE3EB`
  - Label/gruppi: testo attenuato `rgba(221,227,235,0.6)`

- Table
  - Divider riga: `rgba(12,18,26,0.9)`
  - Hover riga: `rgba(11,30,39,0.5)`
  - Zebra (even): `rgba(12,18,26,0.3)`

- Tooltip / Dropdown / Popover
  - Background: `#080A0F`
  - Stroke: `#0C121A` (1px)
  - Ombre: nessuna (no glow), uso di stroke per definizione

### Stati e Interazioni
- Hover: micro-animazioni (lift massimo 1px), saturazione leggera; evitare transizioni vistose
- Focus: `ring` morbido `#0B1E27` (no glow esteso), contrasto sufficiente AA
- Active/Pressed: tono leggermente più scuro del primary/hover, mantenendo leggibilità
- Selection del testo: bg `#0B1E27`, fg `#DDE3EB`
- Scrollbar: thumb `#0C121A`, track `#080A0F`, bordi arrotondati

### Accessibilità
- Contrasto minimo AA su testo primario vs background
- Stato focus sempre visibile su elementi interattivi
- Non affidarsi al solo colore per comunicare stato (icone/label di supporto ove utile)

### Data-attributes utili per styling coerente
Questi attributi sono presenti nei componenti e permettono di applicare stili mirati senza toccare la logica.
- `[data-slot="button"][data-variant="default|outline|ghost|link"]`
- `[data-slot="card"], [data-slot="card-header"], [data-slot="card-footer"]`
- `[data-slot="input"]`
- `[data-slot="sidebar-wrapper"], [data-slot="sidebar"], [data-slot="sidebar-inner"], [data-slot="sidebar-inset"]`
- `[data-slot="sidebar-menu-button"][data-active="true"]`

### Note di implementazione
- Modalità scura forzata sull’`html` (classe `dark`)
- Font Geist Mono caricato da Google Fonts (`display=swap`)
- Tailwind usato per utility e varianti; personalizzazioni avanzate applicate via CSS custom properties

Queste linee guida sono vincolanti per nuovi componenti, sezioni e varianti. Qualsiasi nuova UI deve rispettare i token e gli stati descritti sopra, mantenendo assenza di glow, uso sistematico di stroke sottili e allineamento alla palette specificata.

