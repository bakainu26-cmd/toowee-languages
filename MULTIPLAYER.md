# Saszetki Sophie — quiz multiplayer

## Włącz grę

Wymagana wcześniejsza konfiguracja kont (`accounts_setup.sql`) i słownictwa. W Supabase SQL Editor uruchom `multiplayer_setup.sql` albo skopiuj go z: panel nauczyciela → Graj razem → Utwórz rozgrywkę → Włącz multiplayer — konfiguracja. Migracja jest idempotentna, nie kasuje rozgrywek ani nie zmienia istniejących tabel nauki i monet.

## Prowadzenie

1. Zaloguj się jako nauczyciel lub jako ADMIN w widoku nauczyciela.
2. Wybierz język, zestaw, kierunek pytań, liczbę rund (6/10/15/20/25) czas na odpowiedź (20/30/45/60 sekund) oraz jeden warunek końca gry: „Liczba słówek” albo „Timer”. Liczba słówek (6/10/15/20/25) kończy grę po wybranej porcji, bez zegara całej gry. Timer (1/3/5/10/15/30 minut) kończy grę wyłącznie po czasie, bez limitu liczby rund; bank obejmuje dostępne słówka, a po jego przejściu pytania wracają w kolejnej turze.
3. Potrzeba przynajmniej 4 różnych pytań i odpowiedzi. Pula obejmuje do 1000 słówek z wybranego zestawu. Jeśli jest mniej słówek niż wybranych rund, gra używa dostępnej liczby.
4. Udostępnij kod albo link do pokoju. Każdy z linkiem otwiera ekran gry i podaje tylko pseudonim. Nie trzeba się logować ani zakładać konta. Logowanie jest opcjonalne.
5. Poczekaj na uczestników i rozpocznij grę. Każdy ma własny ekran odpowiedzi i saszetek; prowadzący widzi kod pokoju, ranking, zegar i postęp grupy. Nie widzi pytań, odpowiedzi ani przycisku odsłaniania odpowiedzi. Rundy przechodzą dalej automatycznie.
6. Kolejna runda rozpoczyna się automatycznie po 1 sekundzie od rozliczenia wszystkich odpowiedzi/saszetek albo po upływie czasu na pytanie + 10 sekund na saszetki. Odświeżenie dowolnego uczestnika uruchamia sprawdzanie zegara w bazie — nie wymaga to obecności prowadzącego. Synchronizacja może dodać do 1,5 sekundy oczekiwania. Prowadzący może też zakończyć całą grę wcześniej.
7. W trybie liczby słówek wyniki pojawiają się automatycznie po ostatniej rundzie; w trybie timera — po końcu czasu, nawet jeśli wcześniej przejdziesz cały bank pytań. Zegar całej gry zaczyna odliczać przy rozpoczęciu pierwszej rundy; poczekalnia nie zużywa czasu. Uczeń kończy przyciskiem „Koniec gry — wróć do panelu”.

Japońskie słówka pokazują czytanie w nawiasach w pytaniach i odpowiedziach. Własne materiały nauczyciela są kopiowane do prywatnego banku pytań pokoju w chwili tworzenia — późniejsza edycja słówka nie zmienia trwającej gry.

## Punkty i zabezpieczenia

Poprawna odpowiedź daje 100 karmy, błędna 0. Po poprawnej odpowiedzi uczeń wybiera jedną z trzech saszetek z niespodzianką. Zwykły bonus to 20, 40, 60, 80 lub 100 karmy; pozostałe zdarzenia opisano poniżej. Bonusy są generowane i rozliczane w bazie. Ponowienie odpowiedzi, wyboru saszetki lub rozpoczęcia rundy nie nalicza punktów ani rund drugi raz.

Goście zdobywają punkty w rankingu pokoju. Zalogowani uczestnicy zapisują je dodatkowo jako sumę punktów gier na swoim koncie. Gość może kliknąć „Zaloguj się i zapisz punkty” również po grze: jego uczestnik i cały zdobyty wynik zostają przypisane do zalogowanego konta. Ponowienie tej operacji nie dopisuje punktów drugi raz. Nie łączymy wyniku, jeśli to konto ma już innego uczestnika w tym samym pokoju.

Nie są to monety świata Sophie. Gra nie zmienia SRS, postępu fiszek ani portfela, ponieważ odpowiedź z wyborem i losowy bonus nie są końcową weryfikacją pamięci.

Odpowiedź poprawna i niewybrane bonusy nie są przesyłane uczniowi przed odpowiednim krokiem. Nauczyciel widzi tylko własny pokój. Tabele pokojów, odpowiedzi i uczestników nie są dostępne bezpośrednio dla użytkowników — funkcja RPC sprawdza rolę prowadzącego, członkostwo, czas, rundę i właściciela odpowiedzi. Gość ma losowy 244-bitowy klucz zapisany wyłącznie w swojej przeglądarce; w bazie przechowywany jest tylko SHA-256 klucza. Znajomość pseudonimu lub kodu pokoju nie pozwala zmienić wyniku innego gracza. Klucze, ich skróty i identyfikatory kont nie trafiają do rankingu. Publiczna rola anon może wykonać tylko funkcję gry; nie ma dostępu do tabel ani do tworzenia pokojów czy sterowania rundami. Nie powstają konta w auth.users i nie jest wymagane włączanie anonimowego logowania Supabase. Dołączanie nie tworzy relacji nauczyciel–uczeń ani nie udostępnia prywatnej biblioteki gracza.

## Zapis, dołączanie i limity

Do 30 graczy w pokoju, do 3 otwartych pokojów nauczyciela, ważność pokoju 24 godziny. Po rozpoczęciu nie dołączają nowe osoby, ale wcześniej dołączony gracz może wrócić: gość z tego samego urządzenia i przeglądarki, a użytkownik z kontem po zalogowaniu. Prowadzący może wrócić swoim kodem. Wyniki zachowują się po zamknięciu okna; przycisk „Wróć do ostatniego pokoju” korzysta z kodu zapamiętanego dla danego konta na urządzeniu. Osobie zalogowanej kod/link umożliwia powrót również na innym urządzeniu. Gość potrzebuje klucza z przeglądarki, w której rozpoczął grę; kod pokoju nie zastępuje tego klucza. Po wygaśnięciu pokój nie jest już dostępny przez RPC.

Synchronizacja korzysta z odpytywania co 1,5 sekundy podczas otwartej gry. Ruch w tle nie wysyła zapytań; zakończona gra przestaje odpytywać. Przejściowe błędy nie zerują wyniku. Po błędzie zapisu odpowiedzi lub saszetki można bezpiecznie ponowić wybór. Zapytania i wyniki są chronione przed odpowiedziami z poprzedniej sesji/konta.

## Walidacja

Testy PostgreSQL (PGlite) obejmują rzeczywistą funkcję SQL: dwóch uczniów, role, prywatność banku pytań, ukrycie odpowiedzi, punkty i bonusy, duplikaty, przekroczony czas, sterowanie hosta, ponowną migrację oraz RLS. Testy DOM obejmują poczekalnię, dwa ekrany uczniów, klawiaturę 1–4 / 1–3, błędy połączenia, wznowienie, ranking, wynik końcowy i wylogowanie.

Migracja zachowuje uczestników i odpowiedzi ze wcześniejszej wersji wymagającej kont; stare tabele są pozostawione jako źródło migracji, bez publicznego dostępu. Testy obejmują też rzeczywistą rolę anon, dwa niezależne klucze gości, odmowę przejęcia cudzej sesji, przypisanie wyniku do konta i brak ponownego naliczania punktów.

Konfiguracja produkcyjnej bazy i test na fizycznych urządzeniach wymagają uruchomienia migracji przez właścicielkę Supabase. Nie uruchomiono płatności ani mechanizmu abonamentów.

## Ilustracje saszetek

Wbudowany generator obrazów utworzył trzy niezależne assety: `assets/sophie-pouch-fish.webp`, `assets/sophie-pouch-chicken.webp`, `assets/sophie-pouch-shrimp.webp`. Zapis WebP zachowuje kanał alfa. Grafiki są dekoracyjne; wariant jedzenia nie określa bonusu.

Prompt wspólny: one polished game asset for TooWee Languages, a single sealed wet cat food sachet, cozy illustrated premium packaging, softly shaded hand painted 2.5D style, muted pastel colors, front view, crimped seams, slender grey-brown tabby cat with olive green eyes and cream chin, transparent background, no words, logos or numbers. Warianty: lavender with fish; sage green with chicken; peach with shrimp.

## Niespodzianki i szybkie przechodzenie

Po wyniku można kliknąć tło gry lub nacisnąć spację/Enter, żeby przejść dalej od razu, jeśli wszyscy rozliczyli swoją odpowiedź i saszetkę. Kliknięcie nie przerywa innym wybierania. Bez kliknięcia przejście następuje po jednej sekundzie i synchronizacji.

Każda z trzech saszetek ma niezależnie losowaną w bazie zawartość: zwykły bonus (60%), kradzież (15%), utrata karmy (10%), superkarma (10%), tarcza (5%). Wygląd saszetki nie zdradza wyniku.

- Kradzież: uczeń wybiera innego uczestnika z listy. Przenosi 20% jego aktualnej karmy w tym pokoju, zaokrąglone w dół. Nie dotyka monet świata ani karmy z innych rozgrywek. Przy grze solo kradzież zamienia się w +100.
- Utrata: odejmuje 10% własnej karmy w tym pokoju, zaokrąglone w dół, po doliczeniu poprawnej odpowiedzi. Stan nie spada poniżej zera.
- Superkarma: dodatkowe 200 karmy.
- Tarcza Sophie: blokuje jedną kradzież i znika. Nie chroni przed własną pechową saszetką. Można zgromadzić maksymalnie 3 tarcze. Czwarte trafienie tarczy nie zwiększa zapasu. Licznik widzi tylko właściciel; ranking i lista celów nie zawierają stanu ochrony. Atakujący dowiaduje się o tarczy dopiero po zablokowanej próbie, bez informacji o liczbie pozostałych tarcz.

Kradzież jest zakończona dopiero po wyborze celu; do tego momentu nie przyspieszamy rundy kosztem tego gracza. Obowiązuje nadal limit czasu rundy i całej gry. Duplikat wyboru nie powtarza efektu ani potrącenia. Zalogowanym uczestnikom przypisujemy aktualny wynik tej rozgrywki, więc zarówno zyski, jak i straty aktualizują odpowiednią część sumy karmy na koncie.

Cele wskazuje się losowym identyfikatorem uczestnika pokoju; ranking nie ujawnia identyfikatorów kont ani kluczy gości. Funkcja pomocnicza licząca karmę nie jest dostępna bezpośrednio dla anon/authenticated.

## Pauza po błędnej odpowiedzi

Po zapisaniu błędnej odpowiedzi baza ustawia niezmienny termin pauzy: 5 sekund. Przez ten czas gracz widzi to samo pytanie, poprawną odpowiedź i odliczanie. Tło, spacja i Enter nie przechodzą dalej, a serwer blokuje także bezpośrednie wywołanie ready/next oraz automatyczną zmianę rundy. Ponowienie odpowiedzi nie resetuje ani nie skraca pauzy.

Przy wspólnych rundach zmiana czeka na zakończenie ostatniej aktywnej pauzy. Jeśli w tym czasie kończy się timer całej gry, odpowiedzi nie są już przyjmowane, ale wynik końcowy zaczeka na dokończenie pięciu sekund czytania poprawki. Zakończenie gry przez prowadzącego również nie omija tej krótkiej pauzy. Po upływie pauzy wracają zwykłe zasady szybkiego przechodzenia.

Testy sprawdzają limit 3 tarcz, brak informacji o tarczach w publicznym rankingu, zużycie jednej ochrony na próbę, ponowienie ataku bez podwójnego zużycia, prywatny licznik i komunikat dla atakującego. Osobno sprawdzają 5 sekund poprawki, blokadę klawiatury/kliknięcia, ochronę przed pominięciem przez hosta lub polling oraz ekran prowadzącego bez pytań.

## Zamykanie i wyniki

Prowadzący zamyka grę przyciskiem lub Escape: pokój kończy się, a odpowiedzi pozostają w bazie. Nie trzeba zarządzać ostatnimi pokojami. Nie ma limitu trzech otwartych pokoi. Zerwane połączenie prowadzącego wykrywane jest po dwóch minutach przy kolejnym żądaniu. Historia i statystyki gier oraz przypisywanie gości do uczniów: patrz STATISTICS.md.

## Dwa tryby tempa gry

Przy tworzeniu pokoju wybierz „Gra sterowana przez nauczyciela” (teacher) albo „Swobodna gra” (free). Wyboru nie zmienia się po utworzeniu pokoju. Istniejące pokoje zachowują wspólne rundy.

- Sterowana: nauczyciel rozpoczyna i kończy; pytania są wspólne, grupa czeka na odpowiedzi i saszetki pozostałych. Zachowane automatyczne przejście po rozliczeniu grupy lub końcu czasu.
- Swobodna: nauczyciel rozpoczyna, uczniowie mają osobne pytania i czas odpowiedzi. Kliknięcie tła / spacja / Enter po odpowiedzi i rozliczeniu saszetki przesuwa wyłącznie danego ucznia. Błąd lub brak odpowiedzi: poprawne rozwiązanie i pięć sekund pauzy. Odświeżenie, powrót oraz połączenie gościa z kontem zachowują jego numer pytania.
- Liczba słówek: każdy kończy własną pulę; ranking pozostaje na żywo, aż ukończą wszyscy lub nauczyciel zakończy pokój. Nieobecnego gracza nie pomijamy automatycznie.
- Timer: wspólny czas całego pokoju od rozpoczęcia; każdy zapętla pulę we własnym tempie. Po końcu czasu uwzględniamy trwającą pięciosekundową korektę, potem kończymy pokój.

Ranking, saszetki, kradzieże i ukryte tarcze są wspólne również wtedy, gdy gracze są przy innych pytaniach. Nie zmienia to monet świata. Host nadal nie otrzymuje pytań ani rozwiązań.

Uruchom aktualny multiplayer_setup.sql w Supabase SQL Editor. Migracja dodaje play_mode oraz osobisty numer pytania/czas/zakończenie do uczestników, zachowując wyniki i stare gry. Przed utworzeniem swobodnego pokoju klient sprawdza obsługę trybu: starsza baza pokaże instrukcję aktualizacji, nie utworzy przypadkiem pokoju w innym trybie.

Czas na odpowiedź jest polem liczbowym 1–300 sekund, a czas całej gry 1–30 minut. Oba można wpisać ręcznie lub zmieniać strzałkami pola. Czas odpowiedzi spoza dawnych wartości 20/30/45/60 wymaga aktualnej konfiguracji SQL; klient sprawdza obsługę przed utworzeniem pokoju. Liczby muszą być całkowite.
