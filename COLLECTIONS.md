# Kolekcje Sophisi

Turowa gra live dla 1–12 uczniów i prowadzącego. Wejście: Gry → Kolekcje Sophisi → uczeń → zakres materiałów. Prowadzący dobiera słownictwo z profilu ucznia (całość/folder/zestaw), język, 1–20 pytań na turę, 1–30 rund, czas na pytanie i czas na układanie po obowiązkowym dobraniu (0 = bez limitu). Wiele osób korzysta z tego samego zakresu, a każda ma własne karty i wynik. Prowadzący obserwuje i może pominąć turę nieobecnej osoby lub zakończyć pokój.

## Przebieg

Każdy ma zawsze trzy losowe karty CELÓW wyświetlane nad wspólnymi koszykami i osobną planszą 5 × 5. Zabawki umieszcza się na pustych polach planszy, nie na kartach. Można przeciągnąć zabawkę ze schowka lub wybrać ją i kliknąć pole.

Po wszystkich pytaniach w turze co najmniej jedna poprawna odpowiedź otwiera jedno dobranie: wszystkie zabawki jednego rodzaju z jednego koszyka. Pozostałe zabawki zostają w koszyku.

Serwer po każdym położeniu lub przesunięciu zabawki szuka DOKŁADNEJ sekwencji z karty w ciągłym rzędzie poziomym od lewej do prawej albo pionowym od góry do dołu. Brak przekątnych, odwróconych sekwencji i celów kwadratowych. Karty: 2 jednakowe (3 pkt), 3 jednakowe (5 pkt), 3+1 (6 pkt), dwie konkretne pary (7 pkt), pięć różnych (9 pkt), pięć jednakowych (11 pkt). Kolejność typów w kartach mieszanych jest losowana raz na kartę i pokazywana strzałkami. Sąsiednie elementy poza układem nie przeszkadzają.

Wykrycie celu daje punkty, usuwa wyłącznie pasujące zabawki i zastępuje jedną kartę nowym celem. Pozostałe przedmioty na planszy oraz pozostałe karty są zachowane. Przy nakładających się celach pierwszeństwo ma karta od lewej; przy kilku pasujących pozycjach przeszukujemy wiersze od góry i kolumny od lewej. Następnie system sprawdza inne rozłączne cele. Zużyte zabawki nie punktują ponownie.

Punktacja startowa wymaga oceny balansu podczas gry. Pełna plansza nie przyjmuje kolejnych zabawek; gracz może zakończyć turę. Podczas własnego układania można przesunąć zabawkę na inne puste pole za 2 pkt lub usunąć ją z planszy za 1 pkt. Trzeba mieć wystarczająco dużo punktów. Usunięta zabawka nie trafia do schowka. Przesunięcie może ukończyć cel; najpierw potrącany jest koszt, potem przyznawana nagroda.

Na koniec tury schowek zatrzymuje do dwóch zabawek (kolejność: myszka, piłeczka, piórko, rybka, pluszak). Każdy nadmiarowy przedmiot to −1 pkt, bez wyniku ujemnego. Każdy koszyk po opróżnieniu od razu losuje 4 nowe zabawki. Normalna tura może zakończyć się dopiero po dobraniu; także timeout wyboru nie omija dobierania. Prowadzący zachowuje osobny przycisk pomijania nieobecnych. Jedna runda to jedna tura każdej osoby. Po ostatniej rundzie wygrywa najwyższy wynik; równe wyniki to remis. Nieukończone karty nie dają punktów.

## Baza i synchronizacja

Uruchom `collections_setup.sql` w Supabase po istniejącej konfiguracji kont i słownictwa. Kod jest też w „Aktualizuj panel nauczyciela” oraz w konfiguratorze tej gry. Migracja jest powtarzalna i nie kasuje dotychczasowych gier. Nowo rozpoczynane pokoje używają planszy (`layout=board-v3`). Migracja zmienia cele w pokojach board-v2 na uporządkowane linie, zachowując planszę, punkty i odpowiedzi. Najstarsze pokoje z układaniem bezpośrednio na kartach są nadal obsługiwane; dla pełnych nowych zasad należy utworzyć nowy pokój.

RPC `toowee_collections` wylicza wszystko po stronie serwera. Tabele nie mają bezpośrednich uprawnień dla anon/authenticated. Zapis pokoju jest blokowany w transakcji, a ruch musi mieć aktualną revision i należeć do aktywnego uczestnika. Poprawna odpowiedź jest ukryta przed klientem do rozliczenia pytania. Błędne/nieudzielone odpowiedzi i końcowe punkty są zachowywane. Nauczyciel widzi raport wyłącznie swoich pokoi. Uczniowie mają wyniki połączone z account_id, goście z hashem losowego 256-bitowego klucza zapisanego lokalnie dla danego pokoju. Prowadzący nie jest graczem; test ucznia wymaga drugiego konta albo okna prywatnego.

Widoki odświeżają wspólny stan przez RPC co ok. 1,2 sekundy, analogicznie do istniejącej gry live. Nie jest to transmisja przez WebSocket. Po przerwaniu połączenia klient ponawia odczyt, a gracz może wrócić kodem lub przyciskiem ostatniej gry w tej samej przeglądarce. Nowi gracze dołączają tylko do poczekalni. Pokoje w toku można wznowić z historii. Zamknięcie okna nie usuwa wyników i nie kończy gry.

Limity czasowe są egzekwowane na serwerze podczas kolejnego odczytu: brak odpowiedzi zostaje zapisany jako błąd; upływ czasu układania kończy turę dopiero po dobraniu. Etap wyboru nie ma automatycznego pominięcia. Przy wyłączonych limitach prowadzący może pominąć nieobecnego. Gra nie uruchamia procesów w tle, kiedy nikt nie ma otwartego pokoju.

## Sprawdzenie

`tests/collections-db.test.cjs`: prawdziwy PostgreSQL przez PGlite, role anon/authenticated, uprawnienia, wybór tylko własnych słówek, ponowiona konfiguracja, ruchy i stare revision, zużywanie i punktacja kart, timeouty, schowek, rundy oraz raporty.

`tests/collections-ui.test.cjs`: ustawienia i zakres ucznia, utworzenie pokoju, trzy karty i pięć koszyków, bezpieczny tekst, raporty, link gościa i stabilny token, wznowienie i wylogowanie, brak konfiguracji.

Dodatkowe testy planszy: poziom/pion, kwadrat, pięć różnych, granica wiersza, zajęte pola, zużycie tylko wskazanych zabawek, nakładające się cele i blokada starego revision. UI sprawdza karty nad koszykami, 25 pól i wysyłanie ruchu do pola planszy.

Przeglądarka: podgląd reprezentatywnej planszy na szerokim ekranie i w ramce 390 px. Produkcyjny pokój wymaga uruchomienia migracji w bazie użytkownika.

## Widok i komunikaty

Podczas aktywnej gry dialog wypełnia viewport (100dvh) i nie przewija się. Wysokość planszy jest obliczana z pozostałego miejsca; na telefonie panel pytań jest na dole. Konfiguracja i raporty mogą przewijać się poza aktywną grą. Informacja o poprzedniej odpowiedzi ma stale zarezerwowany obszar na dole panelu, a jej długość nie przesuwa pytań ani planszy. Sprawdzone w przeglądarce: 1363 × 936, 1280 × 600, telefon 390 × 844.

Nowe testy: wymagana dokładna kolejność w obu kierunkach, brak kwadratów/odwróconych sekwencji, natychmiastowe uzupełnienie jednego pustego koszyka, zakaz kończenia przed dobraniem, koszt i uprawnienia move/remove, ochrona przed powtórzeniem opłaty, zdobycie punktów po przesunięciu, zachowanie danych przy aktualizacji board-v2 do board-v3.

## Wersja live-v4 (listopad 2026)

Konfiguracja: uruchom `collections_setup.sql`, potem `collections_live_setup.sql` (przycisk aktualizacji statystyk kopiuje oba). Nowe pokoje wysyłają `protocol: 4`; bez aktualizacji interfejs prosi o konfigurację. Poprzednie pokoje zachowują dotychczasowy silnik.

W nowej rundzie każdy uczeń odpowiada równocześnie na własne pytania. Błąd pokazuje poprawną odpowiedź w oknie „Zapamiętaj słowo”; potwierdzenie jest możliwe po 3 sekundach. Po zakończeniu pytań wszyscy kolejno dobierają i układają zabawki. Nauczyciel może pominąć pozostałe pytania nieobecnych (są zapisywane jako brak odpowiedzi).

Gra kończy się po ustalonej liczbie rund albo po czasie. Upływ czasu zatrzymuje grę na decyzję prowadzącego: zakończyć lub dokończyć bieżącą rundę wszystkim graczom. Można dodać 1–30 minut lub jedną rundę, także po zakończeniu; zachowane są plansze, punkty i odpowiedzi. Wyniki obejmują podium, punkty, liczbę poprawnych/błędnych odpowiedzi i obie listy słów. Nauczyciel ma historię, uczeń widzi własne odpowiedzi i wspólny ranking.

Schowek mieści 5 zabawek, bez kar i odrzucania między turami. Częściowe dobranie wypełnia tylko wolne miejsca. Przy pełnym schowku można zakończyć turę albo zacząć układać. Po pierwszej czynności na planszy nie można już dobrać. Nowe koszyki zawierają trzy rodzaje w ilościach 2–4. Losowanie uwzględnia aktywne cele; po zmianach uzupełnia brakujące potrzebne rodzaje we wspólnej puli.

Sprawdzenie: `tests/collections-live-db.test.cjs` i `tests/collections-live-ui.test.cjs`, a także istniejące testy starszego silnika, interfejsu, nauczyciela i statystyk. Podgląd przeglądarkowy obejmuje planszę i pytania na ekranie 1280×600, okno poprawki odpowiedzi oraz ekran wyników.
