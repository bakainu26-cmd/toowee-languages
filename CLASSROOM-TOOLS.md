# Zeszyt, tablica i materiały

Uruchom `platform-update-20261111.sql` w Supabase SQL Editor po dotychczasowej konfiguracji kont, panelu nauczyciela, zestawów ćwiczeń i Kolekcji. Plik dodaje nowe tabele/funkcje; nie usuwa słówek ani wyników. Zawiera również poprawkę losowania Kolekcji.

- W profilu ucznia: Połącz konto przez e-mail, Zeszyt ucznia, Tablica ucznia.
- Zaproszenie pojawia się na koncie ze zweryfikowanym adresem e-mail; uczeń akceptuje je na platformie. Nie jest wysyłana wiadomość e-mail.
- Zeszyt: nauczyciel dodaje nazwane linki HTTPS; przypisany uczeń odczytuje je na swoim koncie. Uprawnienia zewnętrznych dokumentów są ustawiane w usłudze docelowej.
- Tablice otwierają się w osobnym oknie `whiteboard.html`, z przyciskiem Wstecz, jasnoniebieskim otoczeniem i dużą białą powierzchnią.
- Okrągły, przesuwany piórnik rozwija narzędzia poziomo lub pionowo zależnie od miejsca. Kursor, tekst, długopis (kolor/grubość), marker (kolor/grubość/przezroczystość), gumka i obrazy. Środkowa ikona slajdów pokazuje miniatury.
- Tablica ma 1–200 slajdów i limit 25 MB. PDF jest rasteryzowany w przeglądarce: każda strona staje się osobnym slajdem z zablokowanym tłem.
- Zapis i odczyt w Supabase są ograniczone do właściciela i przypisanego, niezablokowanego ucznia. Zmiany obiektów łączą się przy konflikcie wersji; cofanie dotyczy własnych operacji.
- Aby włączyć podgląd rysowania w trakcie ruchu, uruchom dodatkowo `whiteboard-realtime-setup.sql` w Supabase SQL Editor. Używa prywatnych kanałów z kontrolą dostępu; bez tego tablica synchronizuje zapisane zmiany przez odpytywanie bazy (około sekundy).
- Obrazy słówek: HTTPS lub PNG/JPEG/WebP z komputera; upload jest zmniejszany przed zapisem. Obrazy pojawiają się w listach i fiszkach.
- Pary języków: język słówek oraz język tłumaczenia (polski/angielski/japoński/hiszpański). Dotychczasowe listy domyślnie mają polskie tłumaczenia.

Testy: `classroom-tools-db.test.cjs`, `classroom-tools-ui.test.cjs`. Import PDF sprawdzony również na rzeczywistym dwustronicowym PDF w przeglądarce.

Testy nowej tablicy: `whiteboard-sync.test.cjs`, `whiteboard-ui.test.cjs`, `whiteboard-realtime-db.test.cjs`. Testy obejmują równoczesne zapisy, podgląd trwającego rysowania, marker, slajdy i odmowę dostępu osobie nieprzypisanej. Widok sprawdzony w dwóch oknach lokalnego podglądu; produkcyjny Realtime wymaga powyższej konfiguracji Supabase.
