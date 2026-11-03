# Kolekcje Sophisi

Turowa gra live dla 1–12 uczniów i prowadzącego. Wejście: Gry → Kolekcje Sophisi → uczeń → zakres materiałów. Prowadzący dobiera słownictwo z profilu ucznia (całość/folder/zestaw), język, 1–20 pytań na turę, 1–30 rund, czas na pytanie oraz wspólny limit dobierania i układania (0 = bez limitu). Wiele osób korzysta z tego samego zakresu, a każda ma własne karty i wynik. Prowadzący obserwuje i może pominąć turę nieobecnej osoby lub zakończyć pokój.

## Przebieg

Każdy ma zawsze trzy niezależnie losowane karty. Po wszystkich pytaniach w turze co najmniej jedna poprawna odpowiedź otwiera jedno dobranie: wszystkie zabawki jednego rodzaju z jednego koszyka. Pozostałe zabawki zostają w koszyku. Gracz przeciąga zabawki lub klika pasujące puste miejsca na swoich kartach. Może pracować nad kilkoma celami naraz. Każda zabawka jest zużywana raz. Ukończenie karty natychmiast daje punkty i zastępuje ją nową pustą kartą; inne karty pozostają.

Kolekcje: 2 jednakowe (3 pkt), 3 jednakowe (5 pkt), 3+1 (6 pkt), dwie konkretne pary (7 pkt), pięć różnych (9 pkt), pięć jednakowych (11 pkt). Punktacja startowa wymaga oceny balansu podczas gry.

Na koniec tury schowek zatrzymuje do dwóch zabawek (kolejność: myszka, piłeczka, piórko, rybka, pluszak). Każdy nadmiarowy przedmiot to −1 pkt, bez wyniku ujemnego. Koszyki odnawiają się po opróżnieniu całej wspólnej puli. Jedna runda to jedna tura każdej osoby. Po ostatniej rundzie wygrywa najwyższy wynik; równe wyniki to remis. Nieukończone karty nie dają punktów.

## Baza i synchronizacja

Uruchom `collections_setup.sql` w Supabase po istniejącej konfiguracji kont i słownictwa. Kod jest też w „Aktualizuj panel nauczyciela” oraz w konfiguratorze tej gry. Migracja jest powtarzalna i nie kasuje dotychczasowych gier.

RPC `toowee_collections` wylicza wszystko po stronie serwera. Tabele nie mają bezpośrednich uprawnień dla anon/authenticated. Zapis pokoju jest blokowany w transakcji, a ruch musi mieć aktualną revision i należeć do aktywnego uczestnika. Poprawna odpowiedź jest ukryta przed klientem do rozliczenia pytania. Błędne/nieudzielone odpowiedzi i końcowe punkty są zachowywane. Nauczyciel widzi raport wyłącznie swoich pokoi. Uczniowie mają wyniki połączone z account_id, goście z hashem losowego 256-bitowego klucza zapisanego lokalnie dla danego pokoju. Prowadzący nie jest graczem; test ucznia wymaga drugiego konta albo okna prywatnego.

Widoki odświeżają wspólny stan przez RPC co ok. 1,2 sekundy, analogicznie do istniejącej gry live. Nie jest to transmisja przez WebSocket. Po przerwaniu połączenia klient ponawia odczyt, a gracz może wrócić kodem lub przyciskiem ostatniej gry w tej samej przeglądarce. Nowi gracze dołączają tylko do poczekalni. Pokoje w toku można wznowić z historii. Zamknięcie okna nie usuwa wyników i nie kończy gry.

Limity czasowe są egzekwowane na serwerze podczas kolejnego odczytu: brak odpowiedzi zostaje zapisany jako błąd; upływ czasu układania kończy turę. Przy wyłączonych limitach prowadzący może pominąć nieobecnego. Gra nie uruchamia procesów w tle, kiedy nikt nie ma otwartego pokoju.

## Sprawdzenie

`tests/collections-db.test.cjs`: prawdziwy PostgreSQL przez PGlite, role anon/authenticated, uprawnienia, wybór tylko własnych słówek, ponowiona konfiguracja, ruchy i stare revision, zużywanie i punktacja kart, timeouty, schowek, rundy oraz raporty.

`tests/collections-ui.test.cjs`: ustawienia i zakres ucznia, utworzenie pokoju, trzy karty i pięć koszyków, bezpieczny tekst, raporty, link gościa i stabilny token, wznowienie i wylogowanie, brak konfiguracji.

Przeglądarka: podgląd reprezentatywnej planszy na szerokim ekranie i w ramce 390 px. Produkcyjny pokój wymaga uruchomienia migracji w bazie użytkownika.
