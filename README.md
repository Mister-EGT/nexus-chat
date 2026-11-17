# Nexus Chat Studio

Weboberfläche für OpenRouter mit Chats, Modellvergleich, Prompt-Bibliothek, Streaming, Reasoning-Ansicht und API-Explorer.

Website: https://nexus-chat-studio.mister-e1.chatgpt.site/

## Lokal starten

Voraussetzungen: Node.js und pnpm. Geprüft mit Node.js 24.22.1 und pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Die Entwicklungsadresse wird im Terminal angezeigt.

## Prüfen und bauen

```sh
pnpm check
pnpm test
pnpm build
pnpm exec vite preview
```

Der Produktionsbuild liegt in `dist/` und kann statisch gehostet werden.

## OpenRouter und Speicherung

Ohne API-Key steht ein ausdrücklich gekennzeichneter Demo-Modus zur Verfügung. Einen eigenen OpenRouter-Key gibst du erst in der Oberfläche ein. Chats, Einstellungen und optional der API-Key werden im Browser gespeichert. Es gibt keine mitgelieferten Benutzer-Chats oder privaten Zugangsdaten. Vollständig ausgeschriebene Beispielschlüssel im mitgelieferten API-Katalog wurden durch Platzhalter ersetzt.

## Projektstruktur

- `src/`: Chatlogik, React-Komponenten und Styles
- `public/`: Logo und OpenRouter-API-Katalog
- `tests/`: Tests für Streaming, Scrollposition, Aktivitäten, Quellen, Diffs und Befehlssuche
- `THIRD_PARTY.md`: Quellen und Lizenzhinweise zu Layro-Komponenten
- `.openai/hosting.json`: Konfiguration der bestehenden Sites-Veröffentlichung. Für anderes statisches Hosting genügt der Inhalt von `dist/`.

## Herkunft des Projekts

Ausgangspunkt war der vollständige Quellcode der Sites-Version 17, Quellcommit `1c70c3d4f812716439006b8a225bb12f3633c5ca`. Vor der Veröffentlichung bestanden 33 Tests, Typprüfung und Produktionsbuild. Installierte Abhängigkeiten und generierte Builddateien werden aus den Projektdateien reproduziert.

## UI und Regressionstests

Das Theme folgt standardmäßig dem System. System, Hell und Dunkel stehen in den Einstellungen zur Auswahl. Inter und JetBrains Mono werden lokal ausgeliefert. Die Design-Tokens liegen in `src/styles/tokens.css`, Grundlagen in `base.css` und Komponenten unter `src/styles/components/`.

```sh
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
node scripts/compare-visuals.mjs
```

Die Originalbilder vor der Überarbeitung liegen unverändert unter `tests/visual/baseline`, die geprüften neuen Referenzen unter `tests/visual/after`. Die CI vergleicht regulär gegen die neuen Referenzen. `pnpm test:baseline` aktualisiert nur diese neue Serie bewusst. Das Vergleichsskript erzeugt Original-/Neu-Differenzen unter `tests/visual/diff`. Ergebnisse und Grenzen sind in [docs/UI-VERIFICATION.md](docs/UI-VERIFICATION.md) dokumentiert.
