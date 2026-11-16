# World Class Intonation

Intonationshören für Dirigenten, Etappe 1: Stimmen, Richtung und Orten mit Intervallen und Dur-/Moll-Dreiklängen,
Hörvergleich, Lektionen nach Zeitbudget (5 bis 90 Minuten), Einstufung, Niveau je Thema, Probenwert, Statistik, Sync zwischen Geräten.
Schwester-App von World Class Ear: Web-App ohne Build-Schritt (HTML, CSS, ES-Module), PWA, Zustand in IndexedDB,
Sync über denselben Cloudflare-Worker (Schlüssel wie in World Class Ear, die App hängt „-intonation“ an). Empfohlen: Chrome auf dem Mac, Safari auf dem iPhone.

Klang: je Stimme ein Oszillator mit dem Teiltonspektrum des Instruments. Die Spektren sind an gehaltenen Einzeltönen der
VSCO-2-CE-Aufnahmen (CC0) aus World Class Ear gemessen (`tools/analyze_samples.py`, Ergebnis in `js/audio/spectra.js`).
Die Tonhöhe steht dadurch vollkommen ruhig und ist auf weniger als 0,01 Cent genau. Die Aufnahmen selbst schwanken um bis zu ±20 Cent
(Vibrato) und eignen sich deshalb nicht als Klangquelle für Intonationsaufgaben.
Saxophone, Flügelhorn, Tenorhorn und Euphonium sind vorerst geschätzt, bis die NotePerformer-Töne vorliegen (`../NotePerformer/`).

Konzept: `../CONCEPT.md`. Tests: `../tests/README.md`.
