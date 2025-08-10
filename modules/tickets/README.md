# Flexible Ticket System

Een geavanceerd en flexibel ticketsysteem voor Discord-bots gebouwd met Discord.js en SQLite.

## Functies

- **Dynamische ticket panelen**: Maak meerdere ticket panelen met aangepaste instellingen
- **Aanpasbare knoppen**: Voeg knoppen toe aan panelen met verschillende stijlen en functionaliteiten
- **Formulieren/Modalen**: Optionele formulieren voor ticket creatie met aangepaste velden
- **Thread/Channel modus**: Tickets kunnen worden aangemaakt als kanalen of threads
- **Rol vereisten**: Beperk knoppen tot specifieke rollen
- **Volledige configuratie via slash commands**: Geen code-aanpassingen nodig

## Slash Commands

### /ticket-panel

Beheer ticket panelen en knoppen.

**Subcommands:**

- `create` - Maak een nieuw ticket panel
  - `name` (verplicht) - Naam van het panel
  - `channel` (verplicht) - Kanaal waar het panel geplaatst wordt
  - `title` (optioneel) - Titel van de embed
  - `description` (optioneel) - Beschrijving van de embed
  - `color` (optioneel) - Kleur van de embed (hex code)

- `list` - Toon alle ticket panelen voor deze server

- `delete` - Verwijder een ticket panel
  - `panel_id` (verplicht) - ID van het panel om te verwijderen

- `button` - Beheer knoppen voor een panel
  - `add` - Voeg een knop toe aan een panel
    - `panel_id` (verplicht) - ID van het panel
    - `label` (verplicht) - Tekst op de knop
    - `style` (optioneel) - Stijl van de knop (PRIMARY, SECONDARY, SUCCESS, DANGER)
    - `emoji` (optioneel) - Emoji op de knop
    - `ticket_type` (verplicht) - Type ticket (channel/thread)
    - `use_form` (optioneel) - Gebruik een formulier voor ticket creatie
    - `role_requirement` (optioneel) - Rol vereist om de knop te gebruiken
  - `remove` - Verwijder een knop van een panel
    - `button_id` (verplicht) - ID van de knop om te verwijderen
  - `list` - Toon alle knoppen voor een panel
    - `panel_id` (verplicht) - ID van het panel

- `post` - Post een ticket panel in een kanaal
  - `panel_id` (verplicht) - ID van het panel om te posten
  - `channel` (verplicht) - Kanaal waar het panel geplaatst wordt

### /config

Configureer het ticketsysteem voor de server.

**Subcommands:**

- `ticket` - Configureer ticketinstellingen
  - `category` (verplicht) - Categorie voor ticket kanalen
  - `staff_role` (verplicht) - Rol voor ticket staff
  - `log_channel` (optioneel) - Kanaal voor ticket logs
  - `thread_mode` (optioneel) - Gebruik threads in plaats van kanalen

## Gebruik

1. Configureer het ticketsysteem met `/config ticket`
2. Maak een ticket panel met `/ticket-panel create`
3. Voeg knoppen toe aan het panel met `/ticket-panel button add`
4. Post het panel in een kanaal met `/ticket-panel post`

## Technische Details

### Database Schema

Het systeem gebruikt vier tabellen:

1. `ticket_config` - Server configuratie
2. `ticket_panels` - Ticket panelen
3. `ticket_buttons` - Knoppen voor panelen
4. `tickets` - Aangemaakte tickets

### Caching

Panelen en knoppen worden gecached voor 5 minuten om database hits te verminderen. De cache wordt automatisch vernieuwd wanneer panelen of knoppen worden bijgewerkt.

### Formulieren

Formulieren worden gedefinieerd als JSON in de `form_fields` kolom van de `ticket_buttons` tabel. Het formaat is:

```json
[
  {
    "label": "Vraag 1",
    "placeholder": "Antwoord op vraag 1",
    "required": true,
    "style": "SHORT",
    "minLength": 1,
    "maxLength": 100
  }
]
```

## Onderhoud

- Gebruik `/ticket-panel list` en `/ticket-panel button list` om bestaande panelen en knoppen te bekijken
- Gebruik `/ticket-panel delete` en `/ticket-panel button remove` om panelen en knoppen te verwijderen
- De cache wordt automatisch vernieuwd bij wijzigingen
