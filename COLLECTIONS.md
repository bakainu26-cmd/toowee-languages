# Kolekcje Sophisi

Turowa gra live dla 1–12 uczniów i prowadzącego. Wejście: Gry → Kolekcje Sophisi → uczeń → zakres materiałów. Prowadzący dobiera słownictwo z profilu ucznia (całość/folder/zestaw), język, 1–20 pytań na turę, 1–30 rund, czas na pytanie oraz wspólny limit dobierania i układania (0 = bez limitu). Wiele osób korzysta z tego samego zakresu, a każda ma własne karty i wynik. Prowadzący obserwuje i może pominąć turę nieobecnej osoby lub zakończyć pokój.

## Przebieg

Każdy ma zawsze trzy losowe karty CELÓW wyświetlane nad wspólnymi koszykami i osobną planszą 5 × 5. Zabawki umieszcza się na pustych polach planszy, nie na kartach. Można przeciągnąć zabawkę ze schowka lub wybrać ją i kliknąć pole.

Po wszystkich pytaniach w turze co najmniej jedna poprawna odpowiedź otwiera jedno dobranie: wszystkie zabawki jednego rodzaju z jednego koszyka. Pozostałe zabawki zostają w koszyku.

Serwer po każdym położeniu zabawki szuka wymaganych układów: 2 jednakowe w linii (3 pkt), 3 jednakowe w linii (5 pkt), 3+1 w kwadracie 2 × 2 (6 pkt), dwie konkretne pary w kwadracie 2 × 2 (7 pkt), pięć różnych w linii (9 pkt), pięć jednakowych w linii (11 pkt). Linie są ciągłe, poziome lub pionowe, bez przekątnych. Kolejność typów w obrębie układu jest dowolna. Sąsiednie elementy poza układem nie przeszkadzają.

Wykrycie celu daje punkty, usuwa wyłącznie pasujące zabawki i zastępuje jedną kartę nowym celem. Pozostałe przedmioty na planszy oraz pozostałe karty są zachowane. Przy nakładających się celach pierwszeństwo ma karta od lewej; przy kilku pasujących pozycjach przeszukujemy wiersze od góry i kolumny od lewej. Następnie system sprawdza inne rozłączne cele. Zużyte zabawki nie punktują ponownie.

Punktacja startowa wymaga oceny balansu podczas gry. Pełna plansza nie przyjmuje kolejnych zabawek; gracz może zakończyć turę. Położonych zabawek nie przesuwa się w tej wersji.

Na koniec tury schowek zatrzymuje do dwóch zabawek (kolejność: myszka, piłeczka, piórko, rybka, pluszak). Każdy nadmiarowy przedmiot to −1 pkt, bez wyniku ujemnego. Koszyki odnawiają się po opróżnieniu całej wspólnej puli. Jedna runda to jedna tura każdej osoby. Po ostatniej rundzie wygrywa najwyższy wynik; równe wyniki to remis. Nieukończone karty nie dają punktów.

## Baza i synchronizacja

Uruchom `collections_setup.sql` w Supabase po istniejącej konfiguracji kont i słownictwa. Kod jest też w „Aktualizuj panel nauczyciela” oraz w konfiguratorze tej gry. Migracja jest powtarzalna i nie kasuje dotychczasowych gier. Nowo rozpoczynane pokoje używają planszy (`layout=board-v2`). Już trwające stare pokoje zachowują dawną mechanikę i są nadal obsługiwane, aby nie tracić ułożonych kolekcji.

RPC `toowee_collections` wylicza wszystko po stronie serwera. Tabele nie mają bezpośrednich uprawnień dla anon/authenticated. Zapis pokoju jest blokowany w transakcji, a ruch musi mieć aktualną revision i należeć do aktywnego uczestnika. Poprawna odpowiedź jest ukryta przed klientem do rozliczenia pytania. Błędne/nieudzielone odpowiedzi i końcowe punkty są zachowywane. Nauczyciel widzi raport wyłącznie swoich pokoi. Uczniowie mają wyniki połączone z account_id, goście z hashem losowego 256-bitowego klucza zapisanego lokalnie dla danego pokoju. Prowadzący nie jest graczem; test ucznia wymaga drugiego konta albo okna prywatnego.

Widoki odświeżają wspólny stan przez RPC co ok. 1,2 sekundy, analogicznie do istniejącej gry live. Nie jest to transmisja przez WebSocket. Po przerwaniu połączenia klient ponawia odczyt, a gracz może wrócić kodem lub przyciskiem ostatniej gry w tej samej przeglądarce. Nowi gracze dołączają tylko do poczekalni. Pokoje w toku można wznowić z historii. Zamknięcie okna nie usuwa wyników i nie kończy gry.

Limity czasowe są egzekwowane na serwerze podczas kolejnego odczytu: brak odpowiedzi zostaje zapisany jako błąd; upływ czasu układania kończy turę. Przy wyłączonych limitach prowadzący może pominąć nieobecnego. Gra nie uruchamia procesów w tle, kiedy nikt nie ma otwartego pokoju.

## Sprawdzenie

`tests/collections-db.test.cjs`: prawdziwy PostgreSQL przez PGlite, role anon/authenticated, uprawnienia, wybór tylko własnych słówek, ponowiona konfiguracja, ruchy i stare revision, zużywanie i punktacja kart, timeouty, schowek, rundy oraz raporty.

`tests/collections-ui.test.cjs`: ustawienia i zakres ucznia, utworzenie pokoju, trzy karty i pięć koszyków, bezpieczny tekst, raporty, link gościa i stabilny token, wznowienie i wylogowanie, brak konfiguracji.

Dodatkowe testy planszy: poziom/pion, kwadrat, pięć różnych, granica wiersza, zajęte pola, zużycie tylko wskazanych zabawek, nakładające się cele i blokada starego revision. UI sprawdza karty nad koszykami, 25 pól i wysyłanie ruchu do pola planszy.

Przeglądarka: podgląd reprezentatywnej planszy na szerokim ekranie i w ramce 390 px. Produkcyjny pokój wymaga uruchomienia migracji w bazie użytkownika.
