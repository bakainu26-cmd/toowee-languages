# Saszetki Sophie — quiz multiplayer

## Włącz grę

Wymagana wcześniejsza konfiguracja kont (`accounts_setup.sql`) i słownictwa. W Supabase SQL Editor uruchom `multiplayer_setup.sql` albo skopiuj go z: panel nauczyciela → Graj razem → Utwórz rozgrywkę → Włącz multiplayer — konfiguracja. Migracja jest idempotentna, nie kasuje rozgrywek ani nie zmienia istniejących tabel nauki i monet.

## Prowadzenie

1. Zaloguj się jako nauczyciel lub jako ADMIN w widoku nauczyciela.
2. Wybierz język, zestaw, kierunek pytań, liczbę rund (6/10/15/20/25) czas na odpowiedź (20/30/45/60 sekund) i opcjonalny limit czasu całej gry (1/3/5/10/15/30 minut). Gra kończy się po banku pytań lub po limicie, zależnie co nastąpi wcześniej.
3. Potrzeba przynajmniej 4 różnych pytań i odpowiedzi. Pula obejmuje do 1000 słówek z wybranego zestawu. Jeśli jest mniej słówek niż wybranych rund, gra używa dostępnej liczby.
4. Udostępnij kod albo link do pokoju. Każdy z linkiem otwiera ekran gry i podaje tylko pseudonim. Nie trzeba się logować ani zakładać konta. Logowanie jest opcjonalne.
5. Poczekaj na uczestników i rozpocznij grę. Każdy ma własny ekran odpowiedzi i saszetek; prowadzący widzi ranking. Rundy przechodzą dalej automatycznie.
6. Kolejna runda rozpoczyna się automatycznie po 3 sekundach od rozliczenia wszystkich odpowiedzi/saszetek albo po upływie czasu na pytanie + 10 sekund na saszetki. Odświeżenie dowolnego uczestnika uruchamia sprawdzanie zegara w bazie — nie wymaga to obecności prowadzącego. Synchronizacja może dodać do 2,5 sekundy oczekiwania. Prowadzący może też zakończyć całą grę wcześniej.
7. Po ostatniej rundzie wyniki końcowe pojawiają się automatycznie. Zegar całej gry zaczyna odliczać przy rozpoczęciu pierwszej rundy; poczekalnia nie zużywa czasu. Uczeń kończy przyciskiem „Koniec gry — wróć do panelu”.

Japońskie słówka pokazują czytanie w nawiasach w pytaniach i odpowiedziach. Własne materiały nauczyciela są kopiowane do prywatnego banku pytań pokoju w chwili tworzenia — późniejsza edycja słówka nie zmienia trwającej gry.

## Punkty i zabezpieczenia

Poprawna odpowiedź daje 100 punktów, błędna 0. Po poprawnej odpowiedzi uczeń wybiera jedną z trzech saszetek z losowym bonusem 20, 40, 60, 80 lub 100 punktów. Bonusy są generowane i rozliczane w bazie. Ponowienie odpowiedzi, wyboru saszetki lub rozpoczęcia rundy nie nalicza punktów ani rund drugi raz.

Goście zdobywają punkty w rankingu pokoju. Zalogowani uczestnicy zapisują je dodatkowo jako sumę punktów gier na swoim koncie. Gość może kliknąć „Zaloguj się i zapisz punkty” również po grze: jego uczestnik i cały zdobyty wynik zostają przypisane do zalogowanego konta. Ponowienie tej operacji nie dopisuje punktów drugi raz. Nie łączymy wyniku, jeśli to konto ma już innego uczestnika w tym samym pokoju.

Nie są to monety świata Sophie. Gra nie zmienia SRS, postępu fiszek ani portfela, ponieważ odpowiedź z wyborem i losowy bonus nie są końcową weryfikacją pamięci.

Odpowiedź poprawna i niewybrane bonusy nie są przesyłane uczniowi przed odpowiednim krokiem. Nauczyciel widzi tylko własny pokój. Tabele pokojów, odpowiedzi i uczestników nie są dostępne bezpośrednio dla użytkowników — funkcja RPC sprawdza rolę prowadzącego, członkostwo, czas, rundę i właściciela odpowiedzi. Gość ma losowy 244-bitowy klucz zapisany wyłącznie w swojej przeglądarce; w bazie przechowywany jest tylko SHA-256 klucza. Znajomość pseudonimu lub kodu pokoju nie pozwala zmienić wyniku innego gracza. Klucze, ich skróty i identyfikatory kont nie trafiają do rankingu. Publiczna rola anon może wykonać tylko funkcję gry; nie ma dostępu do tabel ani do tworzenia pokojów czy sterowania rundami. Nie powstają konta w auth.users i nie jest wymagane włączanie anonimowego logowania Supabase. Dołączanie nie tworzy relacji nauczyciel–uczeń ani nie udostępnia prywatnej biblioteki gracza.

## Zapis, dołączanie i limity

Do 30 graczy w pokoju, do 3 otwartych pokojów nauczyciela, ważność pokoju 24 godziny. Po rozpoczęciu nie dołączają nowe osoby, ale wcześniej dołączony gracz może wrócić: gość z tego samego urządzenia i przeglądarki, a użytkownik z kontem po zalogowaniu. Prowadzący może wrócić swoim kodem. Wyniki zachowują się po zamknięciu okna; przycisk „Wróć do ostatniego pokoju” korzysta z kodu zapamiętanego dla danego konta na urządzeniu. Osobie zalogowanej kod/link umożliwia powrót również na innym urządzeniu. Gość potrzebuje klucza z przeglądarki, w której rozpoczął grę; kod pokoju nie zastępuje tego klucza. Po wygaśnięciu pokój nie jest już dostępny przez RPC.

Synchronizacja korzysta z odpytywania co 2,5 sekundy podczas otwartej gry. Ruch w tle nie wysyła zapytań; zakończona gra przestaje odpytywać. Przejściowe błędy nie zerują wyniku. Po błędzie zapisu odpowiedzi lub saszetki można bezpiecznie ponowić wybór. Zapytania i wyniki są chronione przed odpowiedziami z poprzedniej sesji/konta.

## Walidacja

Testy PostgreSQL (PGlite) obejmują rzeczywistą funkcję SQL: dwóch uczniów, role, prywatność banku pytań, ukrycie odpowiedzi, punkty i bonusy, duplikaty, przekroczony czas, sterowanie hosta, ponowną migrację oraz RLS. Testy DOM obejmują poczekalnię, dwa ekrany uczniów, klawiaturę 1–4 / 1–3, błędy połączenia, wznowienie, ranking, wynik końcowy i wylogowanie.

Migracja zachowuje uczestników i odpowiedzi ze wcześniejszej wersji wymagającej kont; stare tabele są pozostawione jako źródło migracji, bez publicznego dostępu. Testy obejmują też rzeczywistą rolę anon, dwa niezależne klucze gości, odmowę przejęcia cudzej sesji, przypisanie wyniku do konta i brak ponownego naliczania punktów.

Konfiguracja produkcyjnej bazy i test na fizycznych urządzeniach wymagają uruchomienia migracji przez właścicielkę Supabase. Nie uruchomiono płatności ani mechanizmu abonamentów.

## Ilustracje saszetek

Wbudowany generator obrazów utworzył trzy niezależne assety: `assets/sophie-pouch-fish.webp`, `assets/sophie-pouch-chicken.webp`, `assets/sophie-pouch-shrimp.webp`. Zapis WebP zachowuje kanał alfa. Grafiki są dekoracyjne; wariant jedzenia nie określa bonusu.

Prompt wspólny: one polished game asset for TooWee Languages, a single sealed wet cat food sachet, cozy illustrated premium packaging, softly shaded hand painted 2.5D style, muted pastel colors, front view, crimped seams, slender grey-brown tabby cat with olive green eyes and cream chin, transparent background, no words, logos or numbers. Warianty: lavender with fish; sage green with chicken; peach with shrimp.
