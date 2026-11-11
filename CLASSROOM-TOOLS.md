# Zeszyt, tablica i materiały

Uruchom `platform-update-20261111.sql` w Supabase SQL Editor po dotychczasowej konfiguracji kont, panelu nauczyciela, zestawów ćwiczeń i Kolekcji. Plik dodaje nowe tabele/funkcje; nie usuwa słówek ani wyników. Zawiera również poprawkę losowania Kolekcji.

- W profilu ucznia: Połącz konto przez e-mail, Zeszyt ucznia, Tablica ucznia.
- Zaproszenie pojawia się na koncie ze zweryfikowanym adresem e-mail; uczeń akceptuje je na platformie. Nie jest wysyłana wiadomość e-mail.
- Zeszyt: nauczyciel dodaje nazwane linki HTTPS; przypisany uczeń odczytuje je na swoim koncie. Uprawnienia zewnętrznych dokumentów są ustawiane w usłudze docelowej.
- Tablice otwierają się pod osobnym adresem `whiteboard.html` w tej samej karcie, z przyciskiem Wstecz, jasnofioletowym otoczeniem i dużą białą powierzchnią.
- Okrągły, przesuwany piórnik rozwija narzędzia poziomo lub pionowo zależnie od miejsca. Kursor, tekst, długopis (kolor/grubość), marker (kolor/grubość/przezroczystość), gumka i obrazy. Środkowa ikona slajdów pokazuje miniatury.
- Tablica ma 1–200 slajdów i limit 25 MB. PDF jest rasteryzowany w przeglądarce: każda strona staje się osobnym slajdem z zablokowanym tłem.
- Zapis i odczyt w Supabase są ograniczone do właściciela i przypisanego, niezablokowanego ucznia. Zmiany obiektów łączą się przy konflikcie wersji; cofanie dotyczy własnych operacji.
- Aby włączyć podgląd rysowania w trakcie ruchu, uruchom dodatkowo `whiteboard-realtime-setup.sql` w Supabase SQL Editor. Używa prywatnych kanałów z kontrolą dostępu; bez tego tablica synchronizuje zapisane zmiany przez odpytywanie bazy (około sekundy).
- Obrazy słówek: HTTPS lub PNG/JPEG/WebP z komputera; upload jest zmniejszany przed zapisem. Obrazy pojawiają się w listach i fiszkach.
- Pary języków: język słówek oraz język tłumaczenia (polski/angielski/japoński/hiszpański). Dotychczasowe listy domyślnie mają polskie tłumaczenia.

Testy: `classroom-tools-db.test.cjs`, `classroom-tools-ui.test.cjs`. Import PDF sprawdzony również na rzeczywistym dwustronicowym PDF w przeglądarce.

Testy nowej tablicy: `whiteboard-sync.test.cjs`, `whiteboard-ui.test.cjs`, `whiteboard-realtime-db.test.cjs`. Testy obejmują równoczesne zapisy, podgląd trwającego rysowania, marker, slajdy i odmowę dostępu osobie nieprzypisanej. Widok sprawdzony w dwóch oknach lokalnego podglądu; produkcyjny Realtime wymaga powyższej konfiguracji Supabase.

## Uporządkowanie interfejsu (2026-11-11)

- Globalna Tablica i Zeszyt są pod Zestawami, bez powielania dla języków. W profilu ucznia są w pasku bezpośrednio po Statystykach.
- Katalog tablic: tworzenie, wyszukiwanie nazwy i filtr języka. Nowa tablica pozwala wybrać język i od razu zaimportować PDF. Język jest zgodnie wstecz zapisany jako prefiks tytułu `[English]`, `[Japanese]` lub `[Spanish]`; istniejące tablice są widoczne jako bez przypisanego języka.
- Tekst ma kolor, rozmiar i rozciągane pole. Gumka wycina fragmenty kreski. Kosz czyści rysunki/tekst aktualnego slajdu, zachowując tło PDF; cofanie przywraca zawartość. Panel ustawień zamyka X i ponowne kliknięcie narzędzia.
- Okna dialogowe dopasowują wysokość do treści i rozmiaru ekranu. Edytor słów ma zwarty układ w dwóch kolumnach.
- Miecze: jeden formularz materiałów, kierunku języków, graczy i parametrów. W grze kliknięcie numeru otwiera pytanie, „Pokaż odpowiedź” odsłania odpowiedź i aktywuje ✓/✕. Obie oceny odkrywają to samo pole; nie zmieniają mechaniki.
- Kierunek języków jest dostępny we wszystkich konfiguracjach gier słownych. Kolekcje wymagają dodatkowo `collections-language-direction.sql` w Supabase SQL Editor po aktualnej konfiguracji live. Istniejące pokoje zostają bez zmian.

Walidacja: testy kierunków gier i formularza Mieczy, przebieg odpowiedzi ✓/✕, wycinanie kreski gumką, współbieżny zapis tablicy oraz test bazy dla odwróconej puli Kolekcji. W przeglądarce sprawdzono import rzeczywistego dwustronicowego PDF również podczas tworzenia tablicy.
