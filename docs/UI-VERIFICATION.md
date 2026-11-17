# Nexus Studio: UI-Prüfung

## Baseline vor Änderungen

Playwright wurde zunächst auf dem unveränderten UI eingerichtet. `tests/visual/baseline` enthält die Originale für 1440 × 1000 und 390 × 844, jeweils hell und dunkel: Start, Chat mit Code und geöffnetem Denkverlauf, Modell-Panel, Einstellungen, Vergleich und Befehlspalette. Vier zusätzliche Inhaltsbilder dokumentieren den Chat.

Die reine CSS-Konsolidierung bestand alle 24 Vergleiche gegen diese Originale. Nachweis: Commit `6fac1a16fe39a6f97e0f2ffeb0f40f2812802699`, [CI-Lauf](https://github.com/Mister-EGT/nexus-chat/actions/runs/43955641613). Erst danach folgten die sichtbaren Änderungen. Die Originale blieben erhalten. Geöffnete Quellen und fertige Vergleichsantworten ergänzen die neue Serie auf 36 Referenzbilder.

## Ergebnisse

Der [Prüflauf](https://github.com/Mister-EGT/nexus-chat/actions/runs/43959244636) bestand Build, Typprüfung, 38 Unit-Tests sowie 80 Browserfälle:

- 32 Screenshotfälle über beide Größen und Themes.
- 48 Browserfälle für Systemtheme, OS-Wechsel, explizite Auswahl, Neuladen, tatsächliches Laden beider lokalen Schriften, Tab/Shift-Tab, Escape und Fokus-Rückgabe.
- Geprüfte Dialoge: Modelle, Einstellungen, Vergleich, Schnellaktionen, Prompt-Bibliothek, API-Explorer, Verbindung, Chat-Transfer, Umbenennen und Löschbestätigung. Die Löschbestätigung wird abgebrochen.
- Vergleich: durchsuchbare Auswahl, Escape innerhalb der Auswahl, getrennte Streams, Abschlussmetriken, Hervorhebungen und Stoppen.
- Quellen per Tap/Klick und Tastatur; der Verlauf selbst ist keine Live-Region.
- 24 axe-Prüfungen mit WCAG A/AA und WCAG 2.1 AA über die sechs Kernansichten, ohne gemeldete Verstöße.
- Alle drei Text-Tokens erreichen mindestens 4,5:1 auf den sechs neutralen Flächen beider Themes. `--on-accent` erreicht denselben Wert auf Akzent und Hover-Akzent. CSS-Vertragstests verhindern alte Palette, direkte Komponentenfarben und `!important`.

Kostenpflichtige Live-Aufrufe an OpenRouter sind nicht Teil dieses Laufs. Die Browser verwenden den Demo-Modus mit abgefangenen Netzwerkaufrufen. Der Transport wird zusätzlich mit kontrollierten SSE-, Fehler-, Abbruch- und Nutzungsantworten geprüft.

## Screenshot-Diff

`node scripts/compare-visuals.mjs` erzeugt Pixel-Differenzen und eine Zusammenfassung. Der geprüfte Stand liegt zusätzlich in `docs/visual-diff-summary.json`. Originale, neue Bilder und die Differenzen wurden für Desktop und Mobil geprüft. Größere Änderungen bei hellen Seitenpanels entstehen durch den jetzt gemeinsamen abgedunkelten nativen Dialoghintergrund. Schrift, Begriffe, Starter und Oberflächenfarben sind beabsichtigte Änderungen. Die CI aktualisiert die Referenzen nicht automatisch.

## Erhaltene Schnittstellen

`docs/preservation-check.json` dokumentiert identische Funktionsquellen für Request-Transport, Chatstream, Schlüsselprüfung, JSON-/Markdown-Export und Speicher-Serialisierung. Bestehende Storage-Keys sind unverändert. Die Vergleichsansicht nutzt den vorhandenen Request-Helfer mit Streaming und fortlaufender Darstellung.
