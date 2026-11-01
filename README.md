# parlons

Ein lokales, graphbasiertes KI-Harness zum Sprachenlernen. Workflows liegen deklarativ unter `workflows/`, Aktionen werden über Provider angebunden und der Lernverlauf wird in SQLite auf dem Gerät gespeichert. Französisch ist voreingestellt; Spanisch und Italienisch sind ebenfalls verfügbar.

## Start

Voraussetzung ist Python 3.10 oder neuer. Im Projektordner starten:

```bash
python server.py
```

Unter Windows funktioniert alternativ `py server.py`. Anschließend `http://127.0.0.1:8765` im Browser öffnen. Die Mikrofonaufnahme benötigt einen aktuellen Browser und eine lokale Adresse wie diese.

## Lokale Sprachdienste

- **Vorlesen:** nutzt die Stimmen des Betriebssystems über die Browser-Sprachausgabe. Die verfügbaren Stimmen und deren Offline-Verfügbarkeit hängen vom installierten Betriebssystem ab.
- **Übersetzen und Coach:** optional Ollama starten und ein Sprachmodell installieren, zum Beispiel `ollama pull qwen2.5:3b`. Die App erkennt installierte Modelle automatisch. Ollama muss unter `127.0.0.1:11434` erreichbar sein.
- **Aufnahme auswerten:** optional einen lokalen whisper.cpp-Server mit Modell unter `127.0.0.1:8080` starten. Die App sendet Audio an dessen `/inference`-Endpunkt. Bei abweichenden Adressen können `OLLAMA_URL` und `WHISPER_URL` gesetzt werden.

Ohne Whisper kannst du aufnehmen, aber nicht transkribieren lassen. Die angezeigte Prozentzahl vergleicht erkannte Wörter mit dem Übungstext; sie ist ausdrücklich **keine phonetische Aussprachebewertung**. Der Lernverlauf liegt in einer lokalen SQLite-Datenbank (`~/.local/share/parlons` unter Linux, `%LOCALAPPDATA%/parlons` unter Windows). Für die Sprachausgabe während einer Aufnahme am besten Kopfhörer verwenden.

Die Desktop-Paketierung ist noch nicht eingerichtet. Die Architektur hält UI, Harness und Provider getrennt, sodass später eine Desktop-Hülle mit Linux-AppImage und einem Windows-Installer ergänzt werden kann, ohne die Lernworkflows neu zu schreiben. Modellgewichte bleiben separate, lokal verwaltete Downloads.